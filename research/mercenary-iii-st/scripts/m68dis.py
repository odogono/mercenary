#!/usr/bin/env python3
"""Disassemble 68000 windows of a captured RAM image.

Damocles and Mercenary III share much of their code at different addresses
(the Lift, ADR 0079), so comparing a Mercenary III window with its Damocles
counterpart is the quickest way to recover a mechanic. Needs capstone, which
the stdlib-only lab does not otherwise use:

    python3 -m venv /tmp/m68 && /tmp/m68/bin/pip install capstone
    /tmp/m68/bin/python research/mercenary-iii-st/scripts/m68dis.py \\
        restricted/<run>/start.ram 56CF4:56D98 56D98:56E2C

Each window is LO:HI in hex, HI exclusive. Bytes capstone cannot decode print
as one dc.w and decoding resumes after them.
"""
import sys

from capstone import CS_ARCH_M68K, CS_MODE_BIG_ENDIAN, CS_MODE_M68K_000, Cs

MD = Cs(CS_ARCH_M68K, CS_MODE_BIG_ENDIAN | CS_MODE_M68K_000)


def disassemble(ram: bytes, lo: int, hi: int) -> None:
    at = lo
    while at < hi:
        for i in MD.disasm(ram[at:hi], at):
            print(f'{i.address:06X}  {i.bytes.hex():<20} {i.mnemonic:<8} {i.op_str}')
            at = i.address + i.size
        if at < hi:
            print(f'{at:06X}  {ram[at:at + 2].hex():<20} dc.w')
            at += 2


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    ram = open(sys.argv[1], 'rb').read()
    for window in sys.argv[2:]:
        lo, hi = (int(x, 16) for x in window.split(':'))
        disassemble(ram, lo, hi)
        print('---')
