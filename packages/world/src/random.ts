/**
 * 确定性随机数：FNV-1a 64 位散列 + SplitMix64 播种 + xoshiro256**。
 *
 * 纯 TypeScript（BigInt 运算），不依赖 node:crypto 或 Web Crypto，
 * 在 Node 与浏览器里对同一输入产生完全相同的序列。禁止 Math.random。
 *
 * 种子 = H(worldSeed, systemName, key[, substream…])。每个子流由名字单独散列得到，
 * 与父流已经取过多少个数无关，因此新增一种取样不会扰动已有子流。
 */

const MASK64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

function splitMixFinalize(z0: bigint): bigint {
  let z = z0 & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return z ^ (z >> 31n);
}

/**
 * 把若干字符串散列为 64 位无符号整数。每段前置 4 字节长度，避免 ("ab","c") 与 ("a","bc") 碰撞。
 */
export function hashParts(parts: readonly string[]): bigint {
  let h = FNV_OFFSET;
  const feed = (byte: number): void => {
    h = ((h ^ BigInt(byte)) * FNV_PRIME) & MASK64;
  };
  for (const part of parts) {
    const bytes = utf8Bytes(part);
    const n = bytes.length;
    feed((n >>> 24) & 0xff);
    feed((n >>> 16) & 0xff);
    feed((n >>> 8) & 0xff);
    feed(n & 0xff);
    for (const byte of bytes) feed(byte);
  }
  return splitMixFinalize(h);
}

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

export class Xoshiro256StarStar {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  constructor(seed: bigint) {
    // SplitMix64 展开 64 位种子为 256 位状态（xoshiro 作者推荐的做法）。
    let x = seed & MASK64;
    const next = (): bigint => {
      x = (x + 0x9e3779b97f4a7c15n) & MASK64;
      return splitMixFinalize(x);
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
  }

  /** 下一个 64 位无符号整数。 */
  nextUint64(): bigint {
    const result = (rotl((this.s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (this.s1 << 17n) & MASK64;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 45n);
    return result;
  }

  /** [0, 1) 内的双精度数，取高 53 位。 */
  nextFloat(): number {
    return Number(this.nextUint64() >> 11n) / 2 ** 53;
  }
}

export interface RandomStream {
  readonly path: readonly string[];
  nextFloat(): number;
  nextUint64(): bigint;
  /** 以名字派生的独立子流。 */
  substream(name: string): RandomStream;
}

function streamFromPath(path: readonly string[]): RandomStream {
  const generator = new Xoshiro256StarStar(hashParts(path));
  const frozenPath = Object.freeze([...path]);
  return {
    path: frozenPath,
    nextFloat: () => generator.nextFloat(),
    nextUint64: () => generator.nextUint64(),
    substream: (name: string) => streamFromPath([...frozenPath, name]),
  };
}

/** seed = H(worldSeed, systemName, key)。 */
export function createRandomStream(worldSeed: string, systemName: string, key: string): RandomStream {
  return streamFromPath([worldSeed, systemName, key]);
}
