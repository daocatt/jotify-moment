/**
 * Safely converts an ArrayBuffer / SharedArrayBuffer / typed-array view / Buffer
 * into a standard Node.js Buffer by copying bytes into a fresh ArrayBuffer.
 * This guarantees sharp / S3 / crypto never receives a SharedArrayBuffer or
 * invalid buffer view.
 */
export function toBuffer(input: Buffer | ArrayBuffer | SharedArrayBuffer | ArrayBufferView): Buffer {
  if (typeof Buffer !== "undefined" && input instanceof Buffer) {
    // If it's already a Buffer, make sure its underlying buffer isn't a SharedArrayBuffer
    if (typeof SharedArrayBuffer !== "undefined" && input.buffer instanceof SharedArrayBuffer) {
      const copy = Buffer.alloc(input.length);
      input.copy(copy);
      return copy;
    }
    return input;
  }

  let srcView: Uint8Array;
  if (input instanceof Uint8Array) {
    srcView = input;
  } else if (ArrayBuffer.isView(input)) {
    srcView = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    srcView = new Uint8Array(input as ArrayBuffer | SharedArrayBuffer);
  }

  // Create a brand new, regular ArrayBuffer and copy bytes
  const destArrayBuffer = new ArrayBuffer(srcView.byteLength);
  const destView = new Uint8Array(destArrayBuffer);
  destView.set(srcView);

  return Buffer.from(destArrayBuffer);
}
