const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.API_KEY;
const KINDO_API = process.env.KINDO_API
const MODEL = process.env.MODEL

const PROMPT = require('./prompt.js')
const sampleLogs = require('./sampleLogs.js')

async function analyzeLogs() {
  const results = await makeLlmRequest(MODEL, API_KEY, PROMPT, sampleLogs)
  console.log(results)
}

analyzeLogs().catch(error => {
  console.error('Error:', error);
});





async function makeLlmRequest(model, apiKey, prompt, logs, baseUrl=KINDO_API) {
  const messages = [{role: "user", content: prompt + logs.join('\n')}];
  const data = {
    model,
    messages,
    stream: true
  };
  const headers = {
    "api-key": apiKey,
    "content-type": "application/json"
  };

  const response = await axios.post(baseUrl, data, {
    headers: headers,
    responseType: 'stream'
  });

  const progressAnimator = createProgressAnimator();
  let analysis = '';
  let pendingData = '';

  return new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      pendingData += chunk.toString();
      progressAnimator()

      try {
        let jsonLines = pendingData.split('\n');
        pendingData = jsonLines.pop();

        for (const line of jsonLines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') {
            return;
          }
          const parsed = JSON.parse(message);
          const token = parsed.choices[0].delta.content;
          if (token) {
            analysis += token;
          }
        }
      } catch (error) {
        // Ignore JSON parse errors and continue accumulating data
      }
    });

    response.data.on('end', () => {
      // Process any remaining pending data
      if (pendingData.trim() !== '') {
        try {
          const parsed = JSON.parse(pendingData);
          const token = parsed.choices[0].delta.content;
          if (token) {
            analysis += token;
          }
        } catch (error) {
          console.error('Could not JSON parse remaining data', pendingData, error);
          reject(error);
        }
      }

      const output = extractOutputText(analysis);
      const jsonMarkdown = extractJsonFromMarkdown(output);
      
      // clear the progress animation
      progressAnimator(true);

      if (jsonMarkdown.match(/ALL CLEAR/g)) {
        resolve("ALL CLEAR");
      } else {
        resolve(jsonMarkdown);
      }
    });
  });
}

// extract text inside <output> tags (for reasoning models) or return the original text
function extractOutputText(str) {
  // Use a regular expression to match text between <output> and </output> tags
  const regex = /<output>([\s\S]*?)<\/output>/g;
  
  // Find all matches in the string
  const matches = str.match(regex);
  
  // If no matches found, return the original string
  if (!matches) {
    return str;
  }
  
  // Extract the text between the tags for each match
  const outputText = matches.map(match => {
    return match.replace(/<\/?output>/g, '').trim();
  }).join('\n');
  
  return outputText;
}

// extract JSON from within markdown if it exists, otherwise return the original string
function extractJsonFromMarkdown(str) {
  // Use a regular expression to match text between <output> and </output> tags
  const regex = /```json\n([\s\S]*?)\n```/g;
  
  // Find all matches in the string
  const matches = str.match(regex);
  
  // If no matches found, return the original string
  if (!matches) {
    return str;
  }
  
  // Extract the text between the tags for each match
  const outputText = matches.map(match => {
    return match.replace(/```(json)?/g, '').trim();
  });
  
  return outputText.join(',\n');
}

// progress animation factory function
// every call to the returned function increments the progress animation
function createProgressAnimator() {
  const delay = 1
  const progressChars = ['-', '\\', '|', '/'];
  let progressIndex = 0;

  return function animateProgress(done=false) {
    if (done) {
      process.stdout.write('\rDONE!                                              \n\n');
      return
    }
    const delayedIndex = Math.floor(progressIndex / delay) % (progressChars.length)
    process.stdout.write(`\r${progressChars[delayedIndex]} (${progressIndex})`);
    progressIndex = progressIndex + 1;
  };
}
