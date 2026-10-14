import struct, sys, os

out = sys.argv[1]
files = [(16, os.path.join(out, "favicon", "favicon-16.png")),
         (32, os.path.join(out, "favicon", "favicon-32.png")),
         (48, os.path.join(out, "_build", "favicon-48.png"))]
blobs = []
for size, p in files:
    with open(p, "rb") as f:
        blobs.append((size, f.read()))
header = struct.pack("<HHH", 0, 1, len(blobs))
offset = 6 + 16 * len(blobs)
entries = b""
body = b""
for size, b in blobs:
    entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(b), offset)
    body += b
    offset += len(b)
with open(os.path.join(out, "favicon", "favicon.ico"), "wb") as f:
    f.write(header + entries + body)
print("ico ok", [s for s, _ in blobs])
