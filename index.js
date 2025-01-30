#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');
dotenv.config();

const argv = require('./lib/yargs.js');
const processBatch = require('./lib/processBatch.js');


const inputFilePath = argv._[0];
if (!inputFilePath) {
  console.error("Please specify a path to the log file to analyze.");
  process.exit(1);
}

const batchSize = argv.batchsize;
const overlapWindow = argv.window;
const llmLogFilePath = argv.llmlog;
const tailMode = argv.tail;
const timeout = argv.timeout;
const maxBatches = argv.maxbatches;

let batchCount = 0;
let logBuffer = [];

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

if (llmLogFilePath) {
  fs.appendFileSync(llmLogFilePath, '\n---- NEW RUN ----\n')
}

if (tailMode) {
  tailLogFile();
} else {
  readLogFile();
}

