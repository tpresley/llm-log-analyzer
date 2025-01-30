module.exports = `
Analyze the following IT log lines for issues, vulnerabilities, and attacks. Provide a JSON object for each finding with the following fields:
- category: an automatically generated category label for the findings (target 1-3 words)
- severity: one of the following values: INFORMATION, SUSPICIOUS, DANGEROUS, CRITICAL
- description: a description of the issue, vulnerability, or attack that was found and pertinent information for locating the culprit and remediation
- ips: an array containing ip addresses (if any) associated with the finding
- logs: an array of the relevant log lines (if there are more than 5 log lines, include the first or most important 5 lines followed by an final string value in the array of "x more relevant log entries" where x is the number of additional log lines relevant to the current finding)
- start: time of the first log line associated with the current item

List the JSON objects in a top level array
`;