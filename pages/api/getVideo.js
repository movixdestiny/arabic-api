import fetch from 'node-fetch';

const API_KEYS = [
    '206f66123cmsh234489eccabe66ap1d53fejsnbd5b11c15c9c', '90aa91617bmsh9bb3a55897c966fp115852jsn95393d75cf7c', '2561b454f4msh3bc2141a8698d7ap111c2bjsn95a0edaf8951',  '879c95b8b8msh2afbe1d4392c461p1b7e5bjsne48007afe996', 'a4c18d0c20mshb3cb645ee293e87p18c0f9jsn70549dd6abf4', 'a4c18d0c20mshb3cb645ee293e87p18c0f9jsn70549dd6abf4' , '8a8c10682fmsh0898cd01a74d121p107f88jsndba86e2fef2e',                                 
];

async function fetchWithRetry(url, headers, retryIndex = 0) {
    if (retryIndex >= API_KEYS.length) {
        throw new Error('All API keys have failed.');
    }

    // Set the current API key in the headers
    const apiKey = API_KEYS[retryIndex];
    const currentHeaders = { ...headers, 'x-rapidapi-key': apiKey };

    try {
        console.log(`Fetching data from API with key: ${apiKey}`);
        const response = await fetch(url, { headers: currentHeaders });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error with API key ${apiKey}: ${error.message}`);
        // Retry with the next key
        return fetchWithRetry(url, headers, retryIndex + 1);
    }
}

export default async function handler(req, res) {
    const { tmdbid } = req.query;

    if (!tmdbid) {
        return res.status(400).json({ error: 'TMDB ID is required' });
    }

    const apiUrl = `https://streaming-availability.p.rapidapi.com/get?output_language=en&tmdb_id=movie%2F${tmdbid}`;
    const apiHeaders = {
        'Accept': 'application/json',
        'x-rapidapi-host': 'streaming-availability.p.rapidapi.com'
    };

    try {
        const data = await fetchWithRetry(apiUrl, apiHeaders);

        console.log('API Response:', JSON.stringify(data, null, 2));

        if (!data.result || !data.result.streamingInfo) {
            throw new Error('Streaming info not found in API response');
        }

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

        const m3u8Url = `https://proxy.smashystream.com/proxy/echo1/https://pcmirror.cc/hls/${netflixId}.m3u8`;
        console.log(`Fetching M3U8 playlist from URL: ${m3u8Url}`);
        const m3u8Response = await fetch(m3u8Url);
        const m3u8Data = await m3u8Response.text();

        let arabicAudioUrl = null;
        let videoUrl = null;

        const lines = m3u8Data.split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

            if (line.startsWith('#EXT-X-MEDIA') && (line.includes('LANGUAGE="ara"') || (line.includes('LANGUAGE="und"') && line.includes('a/0/0.m3u8')))) {
                const audioMatch = line.match(/URI="([^"]+)"/);
                if (audioMatch) {
                    arabicAudioUrl = audioMatch[1];
                }
            }

            if (line.startsWith('#EXT-X-STREAM-INF')) {
                if (line.includes('RESOLUTION=1280x720')) {
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

        const filteredM3U8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="ara",NAME="Arabic",DEFAULT=NO,URI="${arabicAudioUrl}"
#EXT-X-STREAM-INF:BANDWIDTH=40000000,AUDIO="aac",DEFAULT=YES,RESOLUTION=1280x720,CLOSED-CAPTIONS=NONE
${videoUrl}`;

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Disposition', 'inline; filename="stream.m3u8"');
        res.status(200).send(filteredM3U8);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
