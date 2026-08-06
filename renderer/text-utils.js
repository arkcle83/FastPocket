(function exposeTextUtils(globalObject) {
  function splitSegments(input, maxLength = 360) {
    const text = String(input || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return [];

    const result = [];
    for (const rawLine of text.split(/\n+/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      if (!line) continue;
      if (line.length <= maxLength) {
        result.push(line);
        continue;
      }

      const sentences = line.match(/[^.!?…]+[.!?…]+(?:[”’"'])?|[^.!?…]+$/gu) || [line];
      let buffer = "";
      for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
        if (buffer && `${buffer} ${sentence}`.length <= maxLength) {
          buffer += ` ${sentence}`;
        } else {
          if (buffer) result.push(buffer);
          let remainder = sentence;
          while (remainder.length > maxLength) {
            let cut = remainder.lastIndexOf(" ", maxLength);
            // A very long URL or unbroken token still needs a safe backend-sized chunk.
            if (cut < Math.floor(maxLength / 2)) cut = maxLength;
            result.push(remainder.slice(0, cut).trim());
            remainder = remainder.slice(cut).trim();
          }
          buffer = remainder;
        }
      }
      if (buffer) result.push(buffer);
    }
    return result;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  const api = { splitSegments, formatDuration };
  globalObject.FastPocketTextUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
