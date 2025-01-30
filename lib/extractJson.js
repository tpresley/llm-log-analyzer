const extractJson = (text) => {
  const jsonObjects = [];
  // look for content in output tags (reasoning models), markdown block, or just in curly braces
  const regex = /<output>(.*?)<\/output>|```json(.*?)```|```(.*?)```|(\{.*?\})/gs;

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

  // some LLMs really REALLY want to add elipses to the log lines section of the output
  const removeElipses = (str) => {
    return str.split('\n')
      .filter(line => !(line.trim().startsWith('...') || line.trim() === '...'))
      .join('\n');
  }

  let match;
  while ((match = regex.exec(text)) !== null) {
    const jsonString = match[1] || match[2] || match[3] || match[4];
    const cleanedJsonString = removeComments(jsonString);
    const fixedSlashesJsonString = fixSlashes(cleanedJsonString);
    const escapedJsonString = escapeControlCharacters(fixedSlashesJsonString);
    const removedElipsesJsonString = removeElipses(escapedJsonString);
    // sometimes LLMs list JSON objects in sequence with just whitespace between them
    const jsonParts = removedElipsesJsonString.split(/(?<=\})\s*(?=\{)/g); // Split by whitespace between JSON objects
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

module.exports = extractJson;