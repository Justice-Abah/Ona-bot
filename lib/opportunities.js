// Ona opportunity list. Edit this file to add or update opportunities.
// deadline: YYYY-MM-DD (the last day to apply). Closed ones are hidden automatically.
// levels: secondary | undergraduate | bachelors | masters | phd (the applicant's highest level)
// fields: keywords matched against the applicant's field and skills, or ['any'].
// kind: scholarship | fellowship | job | phd (decides the checklist).
// Data last checked: 27 Oct 2026. Always confirm details on the official page.

const OPPS = [
  {id:'actionaid', type:'Internship', title:'Digital Engagement Intern', org:'ActionAid Nigeria, Abuja', deadline:'2026-11-04',
   levels:['bachelors','masters'], fields:['communication','digital','media','marketing','journalism','social media','content'], kind:'job',
   url:'https://yeshub.ng/digital-engagement-intern-at-actionaid/'},
  {id:'wacsi', type:'Internship', title:'WACSI Next Generation Internship 2027', org:'West Africa Civil Society Institute', deadline:'2026-11-08',
   levels:['bachelors','masters'], fields:['development','policy','advocacy','communication','monitoring','evaluation','civil society','economics','political','sociology','research'], kind:'job',
   url:'https://www.globalsouthopportunities.com/2026/10/25/wacsi-4/'},
  {id:'anzisha', type:'Fellowship', title:'Anzisha Fellowship', org:'Anzisha Prize', deadline:'2026-11-10',
   levels:['secondary','undergraduate','bachelors'], ageMin:15, ageMax:22, fields:['entrepreneur','founder','startup','business'], leadership:true, kind:'fellowship',
   url:'https://anzishaprize.org'},
  {id:'fmi', type:'PhD', title:'FMI International PhD Program', org:'Friedrich Miescher Institute, Basel', deadline:'2026-11-15',
   levels:['masters'], fields:['biology','biomedical','biochemistry','genetics','life science','molecular','neuroscience'], kind:'phd',
   url:'https://www.fmi.ch'},
  {id:'cyril', type:'Leadership', title:'Sir Cyril Taylor Young African Leaders Program 2027', org:'AFS Youth Assembly', deadline:'2026-11-19',
   levels:['undergraduate','bachelors','masters','phd'], ageMin:18, ageMax:35, fields:['any'], leadership:true, kind:'fellowship',
   url:'https://www.youthassembly.org/2026/10/16/young-african-leaders-scholarships/'},
  {id:'ibrahim', type:'Leadership', title:'Ibrahim Leadership Fellowship 2027', org:'Mo Ibrahim Foundation', deadline:'2026-11-20',
   levels:['masters','phd'], minExp:7, ageMax:40, fields:['economics','finance','policy','development','governance','law','trade','climate','infrastructure'], leadership:true, kind:'fellowship',
   url:'https://mo.ibrahim.foundation/news/2026/applications-open-2027-ibrahim-leadership-fellowships'},
  {id:'yenching', type:'Scholarship', title:'Yenching Academy Scholars 2027', org:'Peking University, China', deadline:'2026-11-30',
   levels:['bachelors','masters'], ageMax:28, fields:['economics','politics','international','law','history','sociology','philosophy','humanities','social science','public policy'], leadership:true, kind:'scholarship',
   url:'https://yenchingacademy.pku.edu.cn'},
  {id:'bp', type:'Internship', title:'bp Internship Programme 2027', org:'bp, global early careers', deadline:'2026-11-30',
   levels:['undergraduate'], fields:['engineering','science','business','finance','data','computer','chemistry','physics','economics'], kind:'job',
   url:'https://www.bp.com/en/global/corporate/careers.html'},
  {id:'vu', type:'Scholarship', title:'VU Amsterdam Fellowship Programme', org:'Vrije Universiteit Amsterdam', deadline:'2026-12-01',
   levels:['bachelors'], fields:['any'], kind:'scholarship', url:'https://vu.nl'},
  {id:'delft', type:'Scholarship', title:'Justus & Louise van Effen Excellence Scholarship', org:'TU Delft', deadline:'2026-12-01',
   levels:['bachelors'], fields:['engineering','computer','architecture','design','physics','mathematics','science','data'], kind:'scholarship',
   url:'https://www.tudelft.nl'},
  {id:'clarendon', type:'Scholarship', title:'Clarendon Scholarship', org:'University of Oxford', deadline:'2026-12-01', deadlineNote:'Dec 2026 to Jan 2027, set by your course',
   levels:['bachelors','masters'], fields:['any'], kind:'scholarship', url:'https://www.ox.ac.uk/clarendon'},
  {id:'maastricht', type:'Scholarship', title:'NL-High Potential Scholarship', org:'Maastricht University', deadline:'2026-12-10',
   levels:['bachelors'], fields:['any'], kind:'scholarship', url:'https://www.maastrichtuniversity.nl'},
  {id:'cmu', type:'Scholarship', title:'Mastercard Foundation Scholars at CMU-Africa', org:'Carnegie Mellon University Africa, Kigali', deadline:'2026-12-15', deadlineNote:'Early deadline; final deadline 15 Jan',
   levels:['bachelors'], fields:['engineering','computer','software','electrical','information technology','data','artificial intelligence'], kind:'scholarship',
   url:'https://www.africa.engineering.cmu.edu'},
  {id:'imprs', type:'PhD', title:'International Max Planck Research Schools', org:'Max Planck Society, Germany', deadline:'2026-12-31', deadlineNote:'Varies by school',
   levels:['bachelors','masters'], fields:['biology','physics','chemistry','computer','mathematics','neuroscience','science','data'], kind:'phd',
   url:'https://www.mpg.de/imprs'},
  {id:'embl', type:'PhD', title:'EMBL International PhD Programme', org:'EMBL, Europe', deadline:'2026-12-31',
   levels:['bachelors','masters'], fields:['biology','bioinformatics','chemistry','physics','computer','molecular','data'], kind:'phd',
   url:'https://www.embl.org'}
];

const TASKS = {
  scholarship:['Confirm you meet the eligibility rules','Choose your course and check its admission deadline','Update your CV','Draft your personal statement','Ask 2 referees for letters','Gather transcripts and certificates','Submit the application'],
  fellowship:['Read the eligibility rules on the official page','Update your CV','Draft your essay answers','Ask a referee or recommender','Get a friend to proofread','Submit the application'],
  job:['Read the role description closely','Tailor your CV to the role','Write a cover letter','Submit the application'],
  phd:['Pick 2 or 3 research groups you would join','Update your academic CV','Write your motivation statement','Ask 2 or 3 referees','Submit the application']
};

module.exports = { OPPS, TASKS };
