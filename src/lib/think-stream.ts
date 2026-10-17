/** 流式隐藏思考块，同时保留跨 chunk 拆开的开始/结束标签。 */
export function createThinkStripper() {
  let buffer = "";
  let inThink = false;

  function push(content: string): string {
    buffer += content;
    let output = "";
    while (buffer) {
      const tag = inThink ? "</think>" : "<think>";
      const index = buffer.toLowerCase().indexOf(tag);
      if (index >= 0) {
        if (!inThink) output += buffer.slice(0, index);
        buffer = buffer.slice(index + tag.length);
        inThink = !inThink;
        continue;
      }
      // 只缓存可能组成标签的末尾，避免结束标签被分片时丢失。
      let keep = Math.min(buffer.length, tag.length - 1);
      while (keep && !tag.startsWith(buffer.slice(-keep).toLowerCase())) keep--;
      if (!inThink) output += buffer.slice(0, buffer.length - keep);
      buffer = keep ? buffer.slice(-keep) : "";
      break;
    }
    return output;
  }

  function flush(): string {
    const output = inThink ? "" : buffer;
    buffer = "";
    return output;
  }

  return { push, flush };
}
