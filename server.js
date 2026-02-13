const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');

const app = express();

// Increase the limit to accept large audio files
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/', (req, res) => {
    try {
        console.log('Received conversion request...');

        // 1. Extract the Base64 audio from the Gemini JSON structure
        // The structure matches what you set in your n8n "Convert to ogg" node
        const candidates = req.body.candidates;
        
        if (!candidates || !candidates[0] || !candidates[0].content) {
            console.error('Invalid JSON structure received');
            return res.status(400).send('Invalid JSON structure');
        }

        const base64Data = candidates[0].content.parts[0].inlineData.data;
        const rawBuffer = Buffer.from(base64Data, 'base64');

        // 2. Spawn FFmpeg
        // Input: 24kHz, 1 channel, s16le (Gemini Default) -> Output: OGG Opus (WhatsApp Compatible)
        const ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',       // Input format: Signed 16-bit Little Endian
            '-ar', '24000',      // Input Sample Rate: 24kHz
            '-ac', '1',          // Input Channels: 1
            '-i', 'pipe:0',      // Read from Standard Input
            '-c:a', 'libopus',   // Output Codec: Opus
            '-b:a', '16k',       // Bitrate: 16k (good for voice)
            '-f', 'ogg',         // Output format: OGG
            'pipe:1'             // Write to Standard Output
        ]);

        // 3. Pipe the output directly to the response
        res.setHeader('Content-Type', 'audio/ogg');
        ffmpeg.stdout.pipe(res);

        // 4. Handle Errors
        ffmpeg.stderr.on('data', (data) => {
            // FFmpeg logs to stderr, uncomment next line to debug if needed
            // console.log(`FFmpeg Log: ${data}`);
        });

        ffmpeg.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            if (!res.headersSent) res.status(500).send('Conversion Failed');
        });

        // 5. Feed the audio data into FFmpeg
        ffmpeg.stdin.write(rawBuffer);
        ffmpeg.stdin.end();

    } catch (error) {
        console.error('Server error:', error);
        if (!res.headersSent) res.status(500).send('Server Error');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
