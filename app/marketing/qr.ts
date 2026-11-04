import QRCode from 'qrcode';

export const MARKETING_URL = 'https://gdsc-booth.vercel.app/';

export async function getQrSvg(): Promise<string> {
  const svg = await QRCode.toString(MARKETING_URL, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  return svg.replace(/^<\?xml[^>]*\?>\s*/, '');
}
