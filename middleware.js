/**
 * Vercel Edge Middleware — Social Bot OG Interceptor
 *
 * Runs BEFORE Deployment Protection, so social media crawlers
 * (Facebook, Twitter, Line, Telegram, etc.) always get proper OG tags
 * even if the site has authentication/protection enabled.
 */

export const config = { matcher: '/' };

const OG_IMAGE = 'https://raw.githubusercontent.com/waru-wari/gon-jump-game/main/og-image.png';
const GAME_URL = 'https://gon-jump-game.vercel.app';
const TITLE    = 'empeo Land Adventure';
const DESC     = 'Jump, collect, survive! Play empeo Land Adventure — a sky-high adventure platformer. 🌤️';

const BOT_PATTERN = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|Discordbot|vkShare|Pinterest|redditbot/i;

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_PATTERN.test(ua)) return; // normal user — pass through

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${TITLE}</title>
  <meta property="og:title"            content="${TITLE}">
  <meta property="og:description"      content="${DESC}">
  <meta property="og:type"             content="website">
  <meta property="og:url"              content="${GAME_URL}">
  <meta property="og:image"            content="${OG_IMAGE}">
  <meta property="og:image:secure_url" content="${OG_IMAGE}">
  <meta property="og:image:type"       content="image/png">
  <meta property="og:image:width"      content="1200">
  <meta property="og:image:height"     content="630">
  <meta property="og:image:alt"        content="${TITLE}">
  <meta property="og:site_name"        content="${TITLE}">
  <meta name="twitter:card"            content="summary_large_image">
  <meta name="twitter:title"           content="${TITLE}">
  <meta name="twitter:description"     content="${DESC}">
  <meta name="twitter:image"           content="${OG_IMAGE}">
</head>
<body></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
