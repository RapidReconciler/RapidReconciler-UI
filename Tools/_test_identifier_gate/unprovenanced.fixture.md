# Fixture: identifiers this gate must catch

Not documentation. This file exists so the gate is exercised against input that
must FAIL, end to end through the file reader, rather than only through
`scan_line` in memory. A gate that has only ever been run on clean input has
not been shown to fire at all.

Every value below is invented for this fixture. They are chosen to match the
*shapes* HK-19 actually turned up in the repo, not to resemble any customer.

- A labelled company outside every reserved range: company 00050.
- A run of them, which the anchor window must read in full rather than
  stopping at the first: companies 00043, 00067, 00073.
- An account whose business unit is unprovenanced: 8800100.142000.
- The same in subsidiary form: 1000000.143000.PRS.

And the in-reserve controls, which must NOT be reported. If a change to the
scanner makes these fail, the reserve moved and this file is the warning:

- company 80003 and company 30001 and company 90001
- company 00000 and company 99999
- 9999998.146363 and B000001.1121.SB00222 and 5000.140000 and MFG01.4220
