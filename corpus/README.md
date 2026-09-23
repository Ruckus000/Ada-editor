# Engine parity corpus

A frozen snapshot of 28 public documents, used only as test input by
`scripts/measure-engine.mjs` (spike vs. ported engine). They are checked in so
the gate is hermetic; re-fetching would drift the numbers.

None of these documents was written for this project. Each remains the work of
its authors under its own license. `manifest.json` records every file's source
URL (`url`) and license (`license`, an SPDX id where one exists, plus
`licenseNote` where the repository mixes licenses). The files are unmodified
copies of the source at the time of the snapshot.

Licenses represented: MIT, Apache-2.0, BSD-3-Clause, MPL-2.0, GPL-3.0,
CC0-1.0, CC-BY-4.0, CC-BY-SA-2.5, the W3C Document License and the W3C
Software and Document License. Attribution for each file is its `url` entry
in the manifest.
