# Log Anylyzer

## Dependencies
Run `npm install` to install dependencies

## Environment Variables
Create a .env file with the following entries:
```
API_URL="https://llm.kindo.ai/v1/chat/completions"
API_KEY="your-kindo-api-key"
MODEL="model-name-to-use"
```

## Running
Run `node index.js path-to-log-file.log` to analyze logs

## Additional parameters
Here's a list of additional parameters accepted by the tool
  - `-o out.jsonl` sets an output file for the json analysis results in JSONL format
  - `-b 200` sets the size of batches to send to the LLM to 200
  - `-w 50` sets the overlap window of logs from the previous batch to 50
  - `-t` tail the log file and watch for new log lines
  - `-m 10` set the maximum batches to process to 10
  - `-T 10` set the timeout for tailed logs to 10 seconds (after 10 seconds new logs will be analyzed even if there are less new log lines that the batch size)
  - `-l llm.log` set raw output from the LLM to be appended to a file called llm.log 

## Sample Logs
A small set of sample http logs with inculded security issues to find is in the example_logs.log file

## Example
The following command will analyze the logs in example_logs.log in batches of 100 lines, overlapping each new batch by 20 log line, will exit after processing 2 batches, output the JSONL results in a file called results.jsonl, and will output the raw responses from the LLM (for debugging) to a file called llm.log:

`node index.js example_logs.log -o results.jsonl -b 100 -w 20 -m 2 -l llm.log`

