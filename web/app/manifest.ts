import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Express Cleaning Consult',
    short_name: 'Express Cleaning',
    description: 'Request free residential and commercial cleaning quotes. Scope, price and local availability are confirmed before booking.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7FAF9',
    theme_color: '#087F70',
    categories: ['business', 'lifestyle'],
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
    ],
  };
}
