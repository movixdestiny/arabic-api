import fetch from 'node-fetch';

export default async function handler(req, res) {
    const { tmdbid } = req.query;

    if (!tmdbid) {
        return res.status(400).json({ error: 'TMDB ID is required' });
    }

    // Fetch Netflix ID using the new API
    const apiUrl = `https://streaming-availability.p.rapidapi.com/get?output_language=en&tmdb_id=movie%2F${tmdbid}`;
    const apiHeaders = {
        'Accept': 'application/json',
        'x-rapidapi-key': '206f66123cmsh234489eccabe66ap1d53fejsnbd5b11c15c9c',
        'x-rapidapi-host': 'streaming-availability.p.rapidapi.com'
    };

    try {
        console.log(`Fetching data from API: ${apiUrl}`);
        const response = await fetch(apiUrl, { headers: apiHeaders });
        const data = await response.json();

        console.log('API Response:', JSON.stringify(data, null, 2));

        // Check if result and streamingInfo exist
        if (!data.result || !data.result.streamingInfo) {
            throw new Error('Streaming info not found in API response');
        }

        // Navigate to find Netflix videoLink
        let netflixId = null;
        for (const region in data.result.streamingInfo) {
            const services = data.result.streamingInfo[region];
            if (Array.isArray(services)) {
                for (const service of services) {
                    if (service.service === 'netflix' && service.videoLink) {
                        netflixId = service.videoLink.match(/watch\/(\d+)/);
                        if (netflixId) {
                            netflixId = netflixId[1];
                            console.log('Netflix ID:', netflixId);
                            break;
                        }
                    }
                }
                if (netflixId) break;
            }
        }

        if (!netflixId) {
            throw new Error('Netflix ID not found in streaming info');
        }

        // Fetch M3U8 playlist
        const m3u8Url = `https://proxy.smashystream.com/proxy/echo1/https://pcmirror.cc/hls/${netflixId}.m3u8`;
        console.log(`Fetching M3U8 playlist from URL: ${m3u8Url}`);
        const m3u8Response = await fetch(m3u8Url);
        const m3u8Data = await m3u8Response.text();

        // Initialize variables to store filtered URLs
        let arabicAudioUrl = null;
        let videoUrl = null;

        // Process the M3U8 playlist
        const lines = m3u8Data.split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

            // Check for Arabic language using both "und" and "ara"
            if (line.startsWith('#EXT-X-MEDIA') && (line.includes('LANGUAGE="ara"') || (line.includes('LANGUAGE="und"') && line.includes('a/0/0.m3u8')))) {
                // Extract Arabic audio URL
                const audioMatch = line.match(/URI="([^"]+)"/);
                if (audioMatch) {
                    arabicAudioUrl = audioMatch[1];
                }
            }

            if (line.startsWith('#EXT-X-STREAM-INF')) {
                // Look for 720p video stream
                if (line.includes('RESOLUTION=1280x720')) {
                    // Get the video URL from the next line
                    const videoUrlLine = lines[i + 1].trim();
                    if (videoUrlLine) {
                        videoUrl = videoUrlLine;
                    }
                }
            }

            i++;
        }

        if (!arabicAudioUrl || !videoUrl) {
            throw new Error('Arabic audio URL or 720p video URL not found in M3U8 playlist');
        }

        // Construct the filtered M3U8 playlist
        const filteredM3U8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="ara",NAME="Arabic",DEFAULT=NO,URI="${arabicAudioUrl}"
#EXT-X-STREAM-INF:BANDWIDTH=40000000,AUDIO="aac",DEFAULT=YES,RESOLUTION=1280x720,CLOSED-CAPTIONS=NONE
${videoUrl}`;

        // Set headers to serve the file as stream.m3u8
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Disposition', 'inline; filename="stream.m3u8"');
        res.status(200).send(filteredM3U8);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
