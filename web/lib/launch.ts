export const contact = { phone: '+12819727712', displayPhone: '(281) 972-7712', email: 'support@expresscleaningconsult.com' };
export const guarantee = "Not happy with your clean? Tell us within 24 hours and we'll come back and make it right.";
export const offer = { code: 'FIRSTCLEAN10', percent: 10, maximum: 30, terms: '10% off your first completed cleaning, up to $30. New customers only. One offer per customer/property; cannot be combined. Excludes hauling/disposal fees, taxes, tips, and add-ons. Subject to local availability. Mention FIRSTCLEAN10 before approving your quote; our team confirms the discount in writing.' };
export const faqs = [
 ['How does pricing work?', 'Every job is quoted for free based on your space. You approve the price before anything is booked.'],
 ['Who does the cleaning?', 'Local partner cleaners carry out the service. We review the job requirements and confirm the assigned team before scheduling.'],
 ['What areas do you serve?', 'We coordinate cleaning requests nationwide. Enter your ZIP code and our team will check local partner availability before confirming a service.'],
 ["What if I’m not happy?", guarantee],
 ['Do I need a card to get a quote?', 'No. Quotes are free and no card is required.'],
];
// Publish only after the owner confirms an operating partner, actual services and unique local copy.
export const confirmedMarkets: {slug:string;city:string;region:string;description:string}[] = [];
export const localServices = [
 {slug:'move-out-cleaning', code:'MOVE-OUT',name:'Move Out Cleaning'},
 {slug:'deep-cleaning',code:'RES-DEEP',name:'Deep Cleaning'},
 {slug:'airbnb-turnover-cleaning',code:'AIRBNB',name:'Airbnb Turnover Cleaning'},
 {slug:'apartment-turnover-cleaning',code:'APT-TURN',name:'Apartment Turnover Cleaning'},
 {slug:'post-construction-cleaning',code:'POST-CON',name:'Post Construction Cleaning'},
 {slug:'office-cleaning',code:'COMM-OFF',name:'Office Cleaning'},
 {slug:'house-cleaning',code:'RES-STD',name:'House Cleaning'},
];
