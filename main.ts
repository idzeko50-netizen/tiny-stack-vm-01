// Tiny stack VM for make.fun tiny-stack-vm-01 (ISA v1). Runs every instance in
// /input/<id>/ (program.bin + input.bin) and writes /output/<id>/stdout.bin
// and /output/<id>/exit.txt. Faithful to generator/subject/vm.mjs: 32-bit
// wrapping ints, 256-value stack, 64-deep call stack, 256 words of memory,
// ten traps with their own exit codes, 1e6 step limit, 65536 output limit.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p: Uint8Array, q: Uint8Array): [Uint8Array, number] {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const O = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const n = p.length;
  const end = (e: number): [Uint8Array, number] => [O.subarray(0, ol), e];
  for (;;) {
    if (st === 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const o = p[pc];
    // Valid opcodes: 0x00-0x07, 0x10-0x22 except 0x1f, 0x30-0x34, 0x40-0x41, 0x50-0x53.
    if (!(o < 8 || (o > 15 && o < 35 && o !== 31) || (o > 47 && o < 53) || o === 64 || o === 65 || (o > 79 && o < 84))) return end(5);
    const im = o === 1 ? 1 : o === 2 ? 4 : o > 47 && o < 52 ? 2 : 0;
    if (pc + im >= n) return end(9);
    st++;
    const nx = pc + 1 + im;
    pc = nx;
    switch (o) {
      case 0: return end(0);
      case 1:
        if (sp === 256) return end(3);
        D[sp++] = (p[nx - 1] << 24) >> 24;
        break;
      case 2:
        if (sp === 256) return end(3);
        D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 3:
        if (sp < 1) return end(2);
        sp--;
        break;
      case 4:
        if (sp < 1) return end(2);
        if (sp === 256) return end(3);
        D[sp] = D[sp - 1];
        sp++;
        break;
      case 5: {
        if (sp < 2) return end(2);
        const t = D[sp - 1];
        D[sp - 1] = D[sp - 2];
        D[sp - 2] = t;
        break;
      }
      case 6:
        if (sp < 2) return end(2);
        if (sp === 256) return end(3);
        D[sp] = D[sp - 2];
        sp++;
        break;
      case 7: {
        if (sp < 3) return end(2);
        const a = D[sp - 3];
        D[sp - 3] = D[sp - 2];
        D[sp - 2] = D[sp - 1];
        D[sp - 1] = a;
        break;
      }
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30:
      case 32: case 33: case 34: {
        if (sp < 2) return end(2);
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (o === 16) r = (a + b) | 0;
        else if (o === 17) r = (a - b) | 0;
        else if (o === 18) r = Math.imul(a, b);
        else if (o === 19) { if (!b) return end(4); r = (a / b) | 0; }
        else if (o === 20) { if (!b) return end(4); r = (a % b) | 0; }
        else if (o === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (o === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (o === 24) r = a & b;
        else if (o === 25) r = a | b;
        else if (o === 26) r = a ^ b;
        else if (o === 28) r = a << (b & 31);
        else if (o === 29) r = a >> (b & 31);
        else if (o === 30) r = (a >>> (b & 31)) | 0;
        else if (o === 32) r = a === b ? 1 : 0;
        else if (o === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 23:
        if (sp < 1) return end(2);
        D[sp - 1] = (-D[sp - 1]) | 0;
        break;
      case 27:
        if (sp < 1) return end(2);
        D[sp - 1] = ~D[sp - 1];
        break;
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if (o === 48) { pc = nx + rel; break; }
        if (sp < 1) return end(2);
        const v = D[--sp];
        if ((o === 49) === (v === 0)) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 64: {
        if (sp < 1) return end(2);
        const addr = D[sp - 1];
        if (addr < 0 || addr > 255) return end(6);
        D[sp - 1] = M[addr];
        break;
      }
      case 65: {
        if (sp < 2) return end(2);
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr > 255) return end(6);
        sp -= 2;
        M[addr] = v;
        break;
      }
      case 80: {
        if (sp < 1) return end(2);
        const t = String(D[sp - 1]);
        if (ol + t.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < t.length; i++) O[ol++] = t.charCodeAt(i);
        break;
      }
      case 81:
        if (sp < 1) return end(2);
        if (ol + 1 > 65536) return end(11);
        O[ol++] = D[--sp] & 255;
        break;
      case 82:
        if (sp === 256) return end(3);
        D[sp++] = ip < q.length ? q[ip++] : -1;
        break;
      case 83:
        if (sp < 1) return end(2);
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r[0]);
  writeFileSync(join(O, id, 'exit.txt'), `${r[1]}\n`);
}
