const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/', (req, res) => {
    // Generate unique temp filenames
    const tempId = Date.now();
    const inputPath = path.join('/tmp', `input_${tempId}.pcm`);
    const outputPath = path.join('/tmp', `output_${tempId}.ogg`);

    try {
        const candidates = req.body.candidates;
        if (!candidates || !candidates[0]) {
            return res.status(400).send('Invalid JSON');
        }

        // 1. Save the raw PCM audio to a file on disk
        const base64Data = candidates[0].content.parts[0].inlineData.data;
        fs.writeFileSync(inputPath, Buffer.from(base64Data, 'base64'));

        // 2. Convert using FFmpeg
        // Reading from a file allows FFmpeg to calculate the correct duration headers
        const ffmpeg = spawn('ffmpeg', [
            '-y',                // Overwrite output
            '-f', 's16le',       // Input: Signed 16-bit Little Endian
            '-ar', '24000',      // Input: 24kHz
            '-ac', '1',          // Input: 1 Channel
            '-i', inputPath,     // Read from the temp file
            '-c:a', 'libopus',   // Output: Opus codec (Required for WhatsApp PTT)
            '-b:a', '16k',       // Bitrate
            '-application', 'voip', // Optimize for voice
            outputPath           // Write to the temp file
        ]);

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                // 3. Send the file back with the correct Content-Type
                res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
                
                // Create a read stream and pipe it to the response
                const stream = fs.createReadStream(outputPath);
                stream.pipe(res);

                // 4. Cleanup files after sending
                stream.on('end', () => {
                    fs.unlink(inputPath, () => {});
                    fs.unlink(outputPath, () => {});
                });
                stream.on('error', (err) => {
                    console.error('Stream error:', err);
                    res.end(); 
                });
            } else {
                console.error('FFmpeg failed with code', code);
                res.status(500).send('Conversion Failed');
                // Cleanup on error
                fs.unlink(inputPath, () => {});
                fs.unlink(outputPath, () => {});
            }
        });

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).send('Server Error');
        // Try cleanup if paths exist
        if (fs.existsSync(inputPath)) fs.unlink(inputPath, () => {});
        if (fs.existsSync(outputPath)) fs.unlink(outputPath, () => {});
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
