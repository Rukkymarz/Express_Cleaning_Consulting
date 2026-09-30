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

// Add paired, original job photos under /public/gallery only after the customer
// has approved publication. Stock and AI imagery must never be added here as work samples.
export const projectPairs: ProjectPair[] = [];

export function publishedProjectPairs(serviceCode?: string) {
  return projectPairs.filter(project => project.published
    && project.customerApproved
    && project.rightsConfirmed
    && project.sameLocationVerified
    && project.sequenceVerified
    && (!serviceCode || project.serviceCodes.includes(serviceCode)));
}
