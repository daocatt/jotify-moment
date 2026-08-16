/**
 * Safely converts an ArrayBuffer / SharedArrayBuffer / typed-array view into a
 * Buffer by copying bytes — never touches a SharedArrayBuffer backing, which
 * some Node versions reject in Buffer.from().
 */
export function toBuffer(input: Buffer | ArrayBuffer | SharedArrayBuffer | ArrayBufferView): Buffer {
  if (typeof Buffer !== "undefined" && input instanceof Buffer) return input;

  let view: Uint8Array;
  if (input instanceof Uint8Array) {
    view = input;
  } else if (ArrayBuffer.isView(input)) {
    view = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    view = new Uint8Array(input as ArrayBuffer | SharedArrayBuffer);
  }

  const buffer = Buffer.alloc(view.byteLength);
  buffer.set(view);
  return buffer;
}
