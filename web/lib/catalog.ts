export const services = [
  { code: 'RES-STD', name: 'Home cleaning', description: 'Routine cleaning for living areas, kitchen and bathrooms.' },
  { code: 'RES-DEEP', name: 'Deep cleaning', description: 'A more detailed clean for buildup and seasonal resets.' },
  { code: 'MOVE-IN', name: 'Move-in cleaning', description: 'An empty-home refresh before you settle in.' },
  { code: 'MOVE-OUT', name: 'Move-out cleaning', description: 'Clean your vacated home or apartment for handoff.' },
  { code: 'APT-TURN', name: 'Apartment turnover', description: 'Make-ready cleaning for property managers.' },
  { code: 'AIRBNB', name: 'Airbnb turnover', description: 'Guest-turn cleaning with an agreed reset checklist.' },
  { code: 'COMM-OFF', name: 'Office cleaning', description: 'One-time and recurring office cleaning requests.' },
  { code: 'JANITORIAL', name: 'Janitorial services', description: 'Scheduled cleaning for facilities and common spaces.' },
  { code: 'POST-CON', name: 'Post-construction', description: 'Scoped dust and finish cleaning after renovation.' },
  { code: 'AUTO', name: 'Vehicle cleaning', description: 'Tell us about your vehicle and desired cleaning scope.' },
] as const;
export const extras = [
  { code: 'FRIDGE', name: 'Inside refrigerator' }, { code: 'OVEN', name: 'Inside oven' },
  { code: 'CABINETS', name: 'Inside cabinets' }, { code: 'LAUNDRY', name: 'Laundry or linen' },
  { code: 'ORGANIZE', name: 'Light organization' },
] as const;
