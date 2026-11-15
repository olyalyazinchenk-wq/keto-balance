export const nutrients = [
  { name: 'Магний', category: 'Минералы', role: 'Помогает работе мышц и нервной системы.', food: 'Орехи, семена и зелень.', safety: 'Добавки могут вызвать диарею и взаимодействовать с некоторыми антибиотиками. При болезни почек обсудите их с врачом.', url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/' },
  { name: 'Калий', category: 'Минералы', role: 'Важен для работы мышц и нервной системы.', food: 'Авокадо, зелень и рыба.', safety: 'При болезни почек обсудите с врачом количество калия из всех источников. При приёме некоторых лекарств от давления и мочегонных добавки и заменители соли с калием обсудите с врачом: избыток может нарушить сердечный ритм.', url: 'https://ods.od.nih.gov/factsheets/Potassium-HealthProfessional/' },
  { name: 'Витамин D', category: 'Витамины', role: 'Помогает усвоению кальция и поддержанию костей.', food: 'Жирная рыба, яйца и обогащённые продукты.', safety: 'Избыток добавок опасен; добавки витамина D могут взаимодействовать с некоторыми мочегонными. Обследование и приём обсудите с врачом.', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
];

export function filterNutrients(query: string, category: string) {
  const term = query.trim().toLocaleLowerCase('ru');
  return nutrients.filter(item => (category === 'Все' || item.category === category) && item.name.toLocaleLowerCase('ru').includes(term));
}
