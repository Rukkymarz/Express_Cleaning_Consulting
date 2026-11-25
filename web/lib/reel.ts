// Free stock footage (Mixkit Stock Video Free License). These are stock clips, not Express Cleaning Consult jobs.
// TODO(production): self-host these files under /public/video to remove the third-party dependency.
const mixkit = (id: number) => ({
  hd: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
  sd: `https://assets.mixkit.co/videos/${id}/${id}-360.mp4`,
});

export type Clip = { id: number; caption: string; alt: string; poster: string; hd: string; sd: string };

export const heroClips: Clip[] = [
  { id: 45041, caption: 'Upholstery steam cleaning', alt: 'Professional steam cleaning upholstery in a living room', poster: '/gallery/upholstery-after.webp' },
  { id: 5319, caption: 'Bathroom sanitizing', alt: 'Cleaner sanitizing a bathroom surface with disinfectant spray', poster: '/gallery/bedroom-after.webp' },
  { id: 48835, caption: 'Bedroom carpet care', alt: 'Cleaner vacuuming a bedroom carpet', poster: '/gallery/bedroom-after.webp' },
  { id: 21380, caption: 'Detail dusting', alt: 'Detail dusting surfaces in a home', poster: '/gallery/move-out-after.webp' },
  { id: 34661, caption: 'Fabric & sofa refresh', alt: 'Cleaning sofa fabric with a brush and cleaning solution', poster: '/gallery/upholstery-after.webp' },
].map(c => ({ ...c, ...mixkit(c.id) }));

export const clip = (id: number) => mixkit(id);

export const services = [
  { lead: 'Residential', accent: 'cleaning', text: 'Routine and deep cleaning for a healthier home.', slug: 'house-cleaning', code: 'RES-STD', video: 21380 },
  { lead: 'Office &', accent: 'janitorial', text: 'Clean, organized work environments on your schedule.', slug: 'office-cleaning', code: 'COMM-OFF', video: 5319 },
  { lead: 'Move-in /', accent: 'move-out', text: 'Detailed top-to-bottom cleaning for a fresh start.', slug: 'move-out-cleaning', code: 'MOVE-OUT', video: 48835 },
  { lead: 'Airbnb &', accent: 'turnover', text: 'Guest-ready resets between every stay.', slug: 'airbnb-turnover-cleaning', code: 'AIRBNB', video: 34661 },
  { lead: 'Post-', accent: 'construction', text: 'Fine dust and debris removed after your project.', slug: 'post-construction-cleaning', code: 'POST-CON', video: 45040 },
  { lead: 'Pressure washing &', accent: 'junk removal', text: 'Refresh exterior surfaces and clear unwanted items.', slug: 'pressure-washing', code: 'PRESSURE', video: 45039 },
];
