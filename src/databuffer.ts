/*
 * Copyright 2018 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const emptyBuffer = new Uint8Array(0).buffer

//@ts-ignore
if (!ArrayBuffer.transfer) {
  //@ts-ignore
  ArrayBuffer.transfer = function (source, length) {
    if (!(source instanceof ArrayBuffer)) {
      throw new TypeError('Source must be an instance of ArrayBuffer')
    }
    if (length <= source.byteLength) {
      return source.slice(0, length)
    }
    const sourceView = new Uint8Array(source),
    destView = new Uint8Array(new ArrayBuffer(length))
    destView.set(sourceView)
    return destView.buffer
  }
}


export class DataBuffer {
  buffers: ArrayBuffer[] = []
  byteLength: number = 0

  static concat(...bufs: ArrayBuffer[]): ArrayBuffer {
    let max = 0
    for (let i = 0; i < bufs.length; i++) {
      max += bufs[i].byteLength
    }
    let buf = new Uint8Array(max)
    let index = 0
    for (let i = 0; i < bufs.length; i++) {
      buf.set(new Uint8Array(bufs[i]), index)
      index += bufs[i].byteLength
    }
    return buf.buffer
  }

  static fromAscii(m: string): ArrayBuffer {
    if (!m) {
      m = ""
    }
    let buf = new ArrayBuffer(m.length)
    let v = new Uint8Array(buf)
    for (let i = 0; i < m.length; i++) {
      v[i] = m.charCodeAt(i)
    }
    return buf
  }

  static toAscii(a: ArrayBuffer): string {
    return new TextDecoder("utf-8").decode(a)
  }

  drain(n?: number): ArrayBuffer {
    if (n === 0 || this.buffers.length === 0) {
      return emptyBuffer
    }
    if (n === undefined || n > this.byteLength) {
      n = this.byteLength
    }

    const rv = new ArrayBuffer(n)
    const bv = new Uint8Array(rv)
    let need = n
    for (let i = 0, max = this.buffers.length; i < max; i++) {
      if (need === 0) {
        break
      }
      let d = this.buffers.shift()
      if (d === undefined) {
        // shouldn't happen, but makes typescript happy
        throw new Error("array out of bounds!")
      }
      if (d.byteLength >= need) {
        const dd = d.slice(0, need)
        const extra = d.slice(need)
        if (extra.byteLength) {
          this.buffers.unshift(extra)
        }
        this.byteLength -= dd.byteLength
        if (i === 0) {
          // we are done, no need to copy
          return dd
        }
        const dv = new Uint8Array(dd)
        bv.set(dv, n - need)
        need = 0
      } else {
        const dv = new Uint8Array(d)
        bv.set(dv, n - need)
        need -= d.byteLength
        this.byteLength -= d.byteLength
      }
    }
    return rv
  }

  fill(data: ArrayBuffer): void {
    if (data) {
      this.buffers.push(data)
      this.byteLength += data.byteLength
    }
  }

  size(): number {
    return this.byteLength
  }

  length(): number {
    return this.buffers.length
  }
}


export class InboundBuffer extends DataBuffer {
  constructor() {
    super()
  }

  protoLen(): number {
    let count = 0
    let foundCR = -1
    let foundLF = -1
    // find first CRLF in the buffers
    for (let i = 0; i < this.buffers.length; i++) {
      let ba = new Uint8Array(this.buffers[i])
      for (let j = 0; j < ba.byteLength; j++) {
        if (foundCR > -1 && foundLF === foundCR + 1) {
          return count
        }
        count++
        switch (ba[j]) {
          case 13:
            foundCR = count
            break
          case 10:
            // LF
            foundLF = count
            break
          default:
            break
        }
      }
    }
    // check that we didn't match at the end
    if (foundCR > -1 && foundLF === foundCR + 1) {
      return count
    }
    return -1
  }
}