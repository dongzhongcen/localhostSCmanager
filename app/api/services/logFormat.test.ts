import { describe, expect, it } from "vitest";
import { createLineTagger, decodeOutput, formatLine, formatTime } from "./logFormat";

describe("logFormat", () => {
  it("用本地时间格式化", () => {
    expect(formatTime(new Date(2026, 9, 3, 9, 5, 7))).toBe("2026-10-03 09:05:07");
  });

  it("每行带时间和标签", () => {
    const d = new Date(2026, 9, 3, 21, 55, 1);
    expect(formatLine("INFO", "启动", d)).toBe("[2026-10-03 21:55:01] [INFO] 启动\n");
  });

  it("UTF-8 和 GBK 输出都能正确解码", () => {
    expect(decodeOutput(Buffer.from("你好", "utf-8"))).toBe("你好");
    // “你好”的 GBK 编码
    expect(decodeOutput(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]))).toBe("你好");
  });

  it("跨数据块的行会拼好再写，多行会逐行加标签", () => {
    const lines: string[] = [];
    const t = createLineTagger("STDOUT", (l) => lines.push(l));
    t.push(Buffer.from("第一"));
    t.push(Buffer.from("行\r\n第二行\n第三"));
    expect(lines.map((l) => l.replace(/^\[[^\]]+\] /, ""))).toEqual(["[STDOUT] 第一行\n", "[STDOUT] 第二行\n"]);
    t.flush();
    expect(lines[2]).toMatch(/\[STDOUT\] 第三\n$/);
  });

  it("一个汉字的字节被拆到两个数据块也不会乱码", () => {
    const lines: string[] = [];
    const t = createLineTagger("STDERR", (l) => lines.push(l));
    const buf = Buffer.from("错误\n", "utf-8");
    t.push(buf.subarray(0, 2));
    t.push(buf.subarray(2));
    expect(lines[0]).toMatch(/\[STDERR\] 错误\n$/);
  });
});
