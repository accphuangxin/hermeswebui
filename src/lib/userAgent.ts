/**
 * 校验自定义 User-Agent 是否可以安全写入 HTTP 头。
 *
 * HTTP header 值不允许出现控制字符（换行、回车、NUL 等），否则上游会拒绝
 * 请求或抛出解析错误。空字符串视为合法（表示不覆盖）。
 */
export function isValidUserAgentHeader(value: string): boolean {
  if (!value) return true;
  // 允许可见 ASCII 与空格，拒绝其余控制字符
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x08\x0A-\x1F\x7F]/.test(value);
}
