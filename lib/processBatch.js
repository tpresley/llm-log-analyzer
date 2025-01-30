const fs = require('fs');
const axios = require('axios');

const extractJson = require('./extractJson.js');
const argv = require('./yargs.js');


const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL;
const API_URL = process.env.API_URL;
const PROMPT = require('./prompt.js');

if (!API_KEY) {
  throw new Error("API_KEY must be specified in the .env file");
}

const outputFilePath = argv.output;
const llmLogFilePath = argv.llmlog;
const debugPrompt = argv.prompt;

const processBatch = async (batchNumber, batch) => {
  console.log("Starting batch", batchNumber)
  if (llmLogFilePath) {
    fs.appendFileSync(llmLogFilePath, '\nBATCH:\n')
  }
  return new Promise(async (res, rej) => {
    const prompt = `${PROMPT}\n${batch.join('\n')}`;
    const messages = [{ role: "user", content: prompt }];

    if (debugPrompt) {
      console.log("PROMPT")
      console.log(prompt)
      process.exit(0)
    }

    try {
      const response = await axios.post(API_URL, {
        model: MODEL,
        messages,
        stream: true
      }, {
        headers: {
          "api-key": API_KEY,
          "content-type": "application/json"
        },
        responseType: 'stream'
      });
  
      let result = '';
      let buffer = '';
  
      response.data.on('data', (chunk) => {
        process.stdout.write('.')
        buffer += chunk.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last partial line in the buffer
  
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.trim().substring(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              const parsedData = JSON.parse(data);
              if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                const delta = parsedData.choices[0].delta.content;
                result += delta;
                if (llmLogFilePath) {
                  fs.appendFileSync(llmLogFilePath, delta)
                }
              }
            } catch (error) {
              console.error("Error parsing JSON:", error);
            }
          }
        }
      });
  
      response.data.on('end', () => {
        process.stdout.write('\n')
        if (llmLogFilePath) {
          fs.appendFileSync(llmLogFilePath, '\n')
        }
  
        const jsonOutput = extractJson(result);
  
        if (jsonOutput.length === 0) {
          console.log("ALL CLEAR\n", result);
        } else {
          if (outputFilePath) {
            fs.appendFileSync(outputFilePath, jsonOutput.map(obj => JSON.stringify(obj)).join('\n') + '\n');
          } else {
            console.log(jsonOutput)
          }
          console.log("Processed batch", batchNumber, "\n\n");
        }
        res()
      });
  
      response.data.on('error', (error) => {
        console.error("Error processing batch:", error);
        rej("Request error")
      });
    } catch (error) {
      console.error("Error processing batch:", error);
      rej("Error in batch processing")
    }
  })
};

module.exports = processBatch;