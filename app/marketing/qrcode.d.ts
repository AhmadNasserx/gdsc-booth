declare module 'qrcode' {
  export interface QRCodeToStringOptions {
    type?: 'svg' | 'terminal' | 'utf8';
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
  export function toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  const QRCode: { toString: typeof toString };
  export default QRCode;
}
