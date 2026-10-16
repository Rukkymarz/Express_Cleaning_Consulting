export type GalleryImage = {
  src: string;
  alt: string;
  caption: string;
};

export type ProjectPair = {
  id: string;
  title: string;
  serviceCodes: string[];
  summary: string;
  before: GalleryImage;
  after: GalleryImage;
  published: boolean;
  customerApproved: boolean;
  rightsConfirmed: boolean;
  sameLocationVerified: boolean;
  sequenceVerified: boolean;
  sourceNote: string;
};

// These watermarked photographs were supplied by Express Cleaning Consult for its website.
// Crops preserve the same source pairs. The originals are recorded in gallery/SOURCES.md.
export const projectPairs: ProjectPair[] = [
  {
    id: 'exterior-stairs', title: 'Exterior steps', serviceCodes: ['PRESSURE'],
    summary: 'The same stairway before and after an exterior cleaning.',
    before: { src: '/gallery/exterior-stairs-before.webp', alt: 'Dark staining on exterior concrete steps before cleaning', caption: 'Steps before cleaning' },
    after: { src: '/gallery/exterior-stairs-after.webp', alt: 'Lighter exterior concrete steps after cleaning', caption: 'Steps after cleaning' },
    published: true, customerApproved: true, rightsConfirmed: true, sameLocationVerified: true, sequenceVerified: true,
    sourceNote: 'Business-supplied, watermarked before/after image 76f2d21d-0b3f-447d-a456-6d4ba5f5f654.jpeg.',
  },
  {
    id: 'room-clearing', title: 'Room clearing', serviceCodes: ['JUNK', 'RES-STD', 'RES-DEEP'],
    summary: 'A cluttered living space cleared and arranged for everyday use.',
    before: { src: '/gallery/room-clearing-before.webp', alt: 'Cluttered wood-paneled living room before clearing', caption: 'Living space before clearing' },
    after: { src: '/gallery/room-clearing-after.webp', alt: 'The same wood-paneled room cleared and furnished', caption: 'Living space after clearing' },
    published: true, customerApproved: true, rightsConfirmed: true, sameLocationVerified: true, sequenceVerified: true,
    sourceNote: 'Business-supplied, watermarked before/after image IMG_2306.jpeg.',
  },
  {
    id: 'move-out-hall', title: 'Move-out clearing', serviceCodes: ['MOVE-IN', 'MOVE-OUT'],
    summary: 'The same hallway before and after the space was cleared.',
    before: { src: '/gallery/move-out-before.webp', alt: 'Hallway stacked with boxes before clearing', caption: 'Hallway before' },
    after: { src: '/gallery/move-out-after.webp', alt: 'The same hallway clear of stored boxes', caption: 'Hallway after' },
    published: true, customerApproved: true, rightsConfirmed: true, sameLocationVerified: true, sequenceVerified: true,
    sourceNote: 'Business-supplied, watermarked before/after image IMG_2308.jpeg.',
  },
  {
    id: 'upholstery', title: 'Upholstery cleaning', serviceCodes: ['RES-DEEP', 'RES-STD'],
    summary: 'A sofa cushion shown before and after stain treatment.',
    before: { src: '/gallery/upholstery-before.webp', alt: 'Visible mark on gray sofa cushion before cleaning', caption: 'Sofa cushion before' },
    after: { src: '/gallery/upholstery-after.webp', alt: 'Gray sofa cushion after treatment, visible mark removed', caption: 'Sofa cushion after' },
    published: true, customerApproved: true, rightsConfirmed: true, sameLocationVerified: true, sequenceVerified: true,
    sourceNote: 'Business-supplied, watermarked before/after image 14118b65-7378-4e1e-a7bb-b804dcd9b017.jpeg.',
  },
  {
    id: 'commercial-kitchen', title: 'Commercial kitchen detail', serviceCodes: ['COMM-OFF'],
    summary: 'Kitchen equipment before and after detail cleaning.',
    before: { src: '/gallery/commercial-kitchen-before.webp', alt: 'Grease buildup on commercial fryer before cleaning', caption: 'Equipment before' },
    after: { src: '/gallery/commercial-kitchen-after.webp', alt: 'The same commercial fryer after cleaning', caption: 'Equipment after' },
    published: true, customerApproved: true, rightsConfirmed: true, sameLocationVerified: true, sequenceVerified: true,
    sourceNote: 'Business-supplied, watermarked before/after image 352eafd0-3e8f-4d3c-9aff-962f2073d28a.jpeg.',
  },
];

export function publishedProjectPairs(serviceCode?: string) {
  return projectPairs.filter(project => project.published
    && project.customerApproved
    && project.rightsConfirmed
    && project.sameLocationVerified
    && project.sequenceVerified
    && (!serviceCode || project.serviceCodes.includes(serviceCode)));
}
