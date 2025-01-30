const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

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
  .option('prompt', {
    alias: 'p',
    type: 'boolean',
    description: 'Output the first prompt that would be sent to the LLM and exit (for debugging)'
  })
  .option('help', {
    alias: 'h',
    type: 'boolean',
    description: 'Prints out the command line options'
  })
  .argv;

module.exports = argv;