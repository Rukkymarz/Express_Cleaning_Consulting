// Footage: free stock clips (Pexels License and Mixkit Stock Video Free License), color-graded to the
// site palette and self-hosted in /public/video. These are stock clips, not Express Cleaning Consult jobs.
// Sources: Pexels 6195520, 6195513, 6195531, 6197070, 6196259, 6160411, 6195512, 6195522, 6195139; Mixkit 45041, 45040.
const v = (name: string) => ({ src: `/video/${name}.mp4`, poster: `/video/${name}.jpg` });

export type Clip = { key: string; caption: string; alt: string; wide: ReturnType<typeof v>; tall: ReturnType<typeof v> };

export const heroClips: Clip[] = [
  { key: 'team', caption: 'Whole-home deep clean', alt: 'A uniformed cleaning crew vacuuming, mopping and wiping a modern kitchen and dining area', wide: v('hero-team-l'), tall: v('hero-team-p') },
  { key: 'floor', caption: 'Floor care', alt: 'Professional cleaner mopping and vacuuming floors', wide: v('hero-floor-l'), tall: v('hero-floor-p') },
  { key: 'steam', caption: 'Upholstery & detail work', alt: 'Steam cleaning upholstery and wiping glass surfaces', wide: v('hero-steam-l'), tall: v('hero-steam-p') },
  { key: 'pressure', caption: 'Exterior pressure washing', alt: 'Pressure washing an outdoor walkway', wide: v('hero-pressure-l'), tall: v('hero-pressure-p') },
];

export const media = {
  property: v('card-property'),
  partner: v('card-partner'),
  contact: v('contact-team'),
};

export const services = [
  { lead: 'Residential', accent: 'cleaning', text: 'Routine and deep cleaning for a healthier home.', slug: 'house-cleaning', code: 'RES-STD', media: v('svc-residential') },
  { lead: 'Office &', accent: 'janitorial', text: 'Clean, organized work environments on your schedule.', slug: 'office-cleaning', code: 'COMM-OFF', media: v('svc-office') },
  { lead: 'Move-in /', accent: 'move-out', text: 'Detailed top-to-bottom cleaning for a fresh start.', slug: 'move-out-cleaning', code: 'MOVE-OUT', media: v('svc-moveout') },
  { lead: 'Airbnb &', accent: 'turnover', text: 'Guest-ready resets between every stay.', slug: 'airbnb-turnover-cleaning', code: 'AIRBNB', media: v('svc-airbnb') },
  { lead: 'Post-', accent: 'construction', text: 'Fine dust and debris removed after your project.', slug: 'post-construction-cleaning', code: 'POST-CON', media: v('svc-postcon') },
  { lead: 'Pressure washing &', accent: 'junk removal', text: 'Refresh exterior surfaces and clear unwanted items.', slug: 'pressure-washing', code: 'PRESSURE', media: v('svc-pressure') },
];
