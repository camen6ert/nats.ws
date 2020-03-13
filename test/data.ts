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

import test from "ava"
import {DataBuffer, InboundBuffer} from "../src/databuffer"


test('data: empty', (t) => {
    t.plan(3)

    let buf = new DataBuffer()
    //@ts-ignore
    buf.fill(undefined)

    t.is(0, buf.length())
    t.is(0, buf.size())
    t.is(0, buf.drain(1000).byteLength)
})


test('data: simple', (t) => {
    t.plan(4)
    let buf = new DataBuffer()
    buf.fill(DataBuffer.fromAscii("Hello"))
    buf.fill(DataBuffer.fromAscii(" "))
    buf.fill(DataBuffer.fromAscii("World"))
    t.is(3, buf.length())
    t.is(11, buf.size())
    let a = buf.drain()
    t.is(11, a.byteLength)
    const s = DataBuffer.toAscii(a)
    t.is(s, "Hello World")
})

test('from empty', (t) => {
    t.plan(1)
    //@ts-ignore
    let a = DataBuffer.fromAscii(undefined)
    t.is(0, a.byteLength)
})

test('data: inbound buffer empty', (t) => {
    const b = new InboundBufferBuilder()
    const ib = b.fragment()
    t.is(ib.length(), 0)
})

test('data: inbound buffer cmd', (t) => {
    const b = new InboundBufferBuilder()
    b.info({hello: 'world'})
    b.ok()
    b.err("hello")
    b.ping()
    b.pong()
    const cmds = b.getCommands()
    const scmds = cmds.join('')

    const ib = b.fragment()

    t.is(cmds.length, 5)
    t.is(ib.length(), scmds.length)

    for (let i = 0; i < cmds.length; i++) {
        let dbv = ib.drain(ib.protoLen())
        t.log(colorize(cmds[i]), colorize(DataBuffer.toAscii(dbv)))
        t.is(cmds[i], DataBuffer.toAscii(dbv))
    }

})

test('data: drain', (t) => {
    const b = new InboundBufferBuilder()
    b.push('0')
    b.push('1')
    b.push('2')
    b.push('3')

    const ib = b.fragment()
    let v = ib.drain(1)
    t.is(v.byteLength, 1)
    t.is(DataBuffer.toAscii(v), '0')

    v = ib.drain(2)
    t.is(v.byteLength, 2)
    t.is(DataBuffer.toAscii(v), '12')

    v = ib.drain(3)
    t.is(v.byteLength, 1)
    t.is(DataBuffer.toAscii(v), '3')
})

function colorize(s: string): string {
    let a = s.split('\r')
    s = a.join('␍')
    a = s.split('\f')
    s = a.join('␊')
    a = s.split('\n')
    return a.join('␤')
}


class InboundBufferBuilder {
    commands: string[]
    buf: ArrayBuffer

    constructor() {
        this.buf = new ArrayBuffer(0)
        this.commands = []
    }

    sub(sid: number, sub: string, queue?: string) {
        if (queue) {
            this.push(`SUB ${sub} ${queue} ${sid}\r\n`)
        } else {
            this.push(`SUB ${sub} ${sid}\r\n`)
        }
    }

    getCommands(): string[] {
        return this.commands
    }

    fragment(): InboundBuffer {
        const d = new InboundBuffer()
        const v = new Uint8Array(this.buf)
        for (let i = 0; i < v.byteLength; i++) {
            d.fill(v.slice(i, i + 1))
        }
        return d

    }

    push(s: string) {
        this.commands.push(s)
        const i = this.buf.byteLength
        const max = i + s.length
        //@ts-ignore
        this.buf = ArrayBuffer.transfer(this.buf, max)
        const a = new Uint8Array(this.buf)
        const n = DataBuffer.fromAscii(s)
        const nn = new Uint8Array(n)
        a.set(nn, i)
    }

    err(m: string): void {
        this.push(`-ERR ${m}\r\n`)
    }

    ok(): void {
        this.push(`+OK\r\n`)
    }

    ping(): void {
        this.push(`PING\r\n`)
    }

    pong(): void {
        this.push(`PONG\r\n`)
    }

    info(obj: any): void {
        obj = obj || {}
        const v = `INFO ${JSON.stringify(obj)}\r\n`
        this.push(v)
    }

    msg(sub: string, sid: number, reply: string = '', payload: string = ''): void {
        const len = Buffer.byteLength(payload)
        if (reply) {
            this.push(`MSG ${sub} ${sid} ${reply} ${len}\r\n${payload}\r\n`)
        } else {
            this.push(`MSG ${sub} ${sid} ${len}\r\n${payload}\r\n`)
        }
    }
}


