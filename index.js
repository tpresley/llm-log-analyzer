#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const dotenv = require('dotenv');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

dotenv.config();

const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL;
const API_URL = process.env.API_URL;
const PROMPT = require('./prompt.js');

if (!API_KEY) {
  throw new Error("API_KEY must be specified in the .env file");
}


const argv = yargs(hideBin(process.argv))
  .option('batchsize', {
    alias: 'b',
    type: 'number',
    description: 'Overrides the default batch size',
    default: 200
  })
  .option('window', {
    alias: 'w',
    type: 'number',
    description: 'Overrides the default overlap window with previous results',
    default: 50
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'File name to store results in JSONL format'
  })
  .option('tail', {
    alias: 't',
    type: 'boolean',
    description: 'Watch for new lines in the input file and process them when there are enough for a new batch'
  })
  .option('timeout', {
    alias: 'T',
    type: 'number',
    description: 'Timeout in seconds for tail mode'
  })
  .option('maxbatches', {
    alias: 'm',
    type: 'number',
    description: 'Maximum number of batches to process before exiting'
  })
  .option('llmlog', {
    alias: 'l',
    type: 'string',
    description: 'File name to store LLM response logs'
  })
  .option('help', {
    alias: 'h',
    type: 'boolean',
    description: 'Prints out the command line options'
  })
  .argv;

const inputFilePath = argv._[0];
if (!inputFilePath) {
  console.error("Please specify a path to the log file to analyze.");
  process.exit(1);
}

const batchSize = argv.batchsize;
const overlapWindow = argv.window;
const outputFilePath = argv.output;
const llmLogFilePath = argv.llmlog;
const tailMode = argv.tail;
const timeout = argv.timeout;
const maxBatches = argv.maxbatches;

let batchCount = 0;
let logBuffer = [];

const processBatch = async (batchNumber, batch) => {
  console.log("Starting batch", batchNumber)
  if (llmLogFilePath) {
    fs.appendFileSync(llmLogFilePath, '\nBATCH:\n')
  }
  return new Promise(async (res, rej) => {
    const prompt = `${PROMPT}\n${batch.join('\n')}`;
    const messages = [{ role: "user", content: prompt }];
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

const extractJson = (text) => {
  const jsonObjects = [];
  // look for content in output tags (reasoning models), markdown block, or just in curly braces
  const regex = /<output>(.*?)<\/output>|```json(.*?)```|(\{.*?\})/gs;

  // remove javascript comments to prevent JSON parse errors
  // (LLMs sometimes add javascript comments inside JSON objects)
  const removeComments = (jsonString) => {
    return jsonString.replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*(?=[\n\r])/g, (match, group1) => {
        // If the match is a quoted string, return it as is
        if (group1) {
            return group1;
        }
        // Otherwise, it's a comment, so replace it with an empty string
        return '';
    }).trim();
  };

  // all forward slashes have to be double escaped in JSON strings to parse properly
  const fixSlashes = (jsonString) => {
    return jsonString.replace(/\\/g, '\\\\');
  }

  // properly escape control characters to work with JSON.parse
  const escapeControlCharacters = (str) => {
    return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, function (c) {
        switch (c) {
            // double escape control chars that aren't allowed in JSON strings
            case '\b': return '\\b';
            case '\t': return '\\t';
            case '\n': return '\n';
            case '\f': return '\\f';
            case '\r': return '\\r';
            case '\"': return '\\"';
            case '\\': return '\\';
            default:
                return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
        }
    });
  }

  let match;
  while ((match = regex.exec(text)) !== null) {
    const jsonString = match[1] || match[2] || match[3];
    const cleanedJsonString = removeComments(jsonString);
    const escapedJsonString = escapeControlCharacters(fixSlashes(cleanedJsonString));
    // sometimes LLMs list JSON objects in sequence with just whitespace between them
    const jsonParts = escapedJsonString.split(/(?<=\})\s*(?=\{)/g); // Split by whitespace between JSON objects
    for (const part of jsonParts) {
      try {
        const jsonObject = JSON.parse(part);
        if (Array.isArray(jsonObject)) {
          jsonObjects.push(...jsonObject);
        } else {
          jsonObjects.push(jsonObject);
        }
      } catch (e) {
        console.error("Failed to parse JSON:", e);
        console.log(part)
      }
    }
  }
  return jsonObjects;
};

const readLogFile = async () => {
  const fileStream = fs.createReadStream(inputFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    logBuffer.push(line);
    if (logBuffer.length >= batchSize + overlapWindow) {
      const batch = logBuffer.slice(0, batchSize);
      logBuffer = logBuffer.slice(batchSize - overlapWindow);
      await processBatch(batchCount + 1, batch);
      batchCount++;
      if (maxBatches && batchCount >= maxBatches) {
        break;
      }
    }
  }

  if (logBuffer.length > overlapWindow && (!maxBatches || batchCount < maxBatches)) {
    await processBatch(batchCount + 1, logBuffer);
    batchCount++;
  }  
};

const tailLogFile = () => {
  let timeoutId;
  const processTailBatch = async () => {
    if (logBuffer.length > overlapWindow) {
      const batch = logBuffer.slice(0, batchSize);
      logBuffer = logBuffer.slice(batchSize - overlapWindow);
      await processBatch(batchCount + 1, batch);
      batchCount++;
      if (maxBatches && batchCount >= maxBatches) {
        process.exit(0);
      }
    }
    timeoutId = setTimeout(processTailBatch, timeout * 1000);
  };

  fs.watchFile(inputFilePath, async (curr, prev) => {
    if (curr.size > prev.size) {
      const fileStream = fs.createReadStream(inputFilePath, { start: prev.size });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      for await (const line of rl) {
        logBuffer.push(line);
      }

      if (logBuffer.length >= batchSize) {
        clearTimeout(timeoutId);
        await processTailBatch();
      }
    }
  });

  timeoutId = setTimeout(processTailBatch, timeout * 1000);
};

if (tailMode) {
  if (llmLogFilePath) {
    fs.appendFileSync(llmLogFilePath, '\n---- NEW RUN ----\n')
  }
  tailLogFile();
} else {
  if (llmLogFilePath) {
    fs.appendFileSync(llmLogFilePath, '\n---- NEW RUN ----\n')
  }
  readLogFile();
}

