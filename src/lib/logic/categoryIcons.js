// 分類可選的圖示（Material Symbols Rounded 精選 80 個），依群組排列；key 對應 src/lib/icons.js。
// 存在 categories.icon；沒選（null）或不在清單裡時，依名稱對應（display.js 的 categoryIcon）。
export const CATEGORY_ICON_GROUPS = [
  { title: '飲食', icons: [
    { key: 'food', label: '餐廳' }, // restaurant
    { key: 'local_cafe', label: '咖啡' }, // local_cafe
    { key: 'bakery_dining', label: '麵包' }, // bakery_dining
    { key: 'lunch_dining', label: '速食' }, // lunch_dining
    { key: 'ramen_dining', label: '麵食' }, // ramen_dining
    { key: 'bento', label: '便當' }, // bento
    { key: 'icecream', label: '點心' }, // icecream
    { key: 'local_bar', label: '酒類' }, // local_bar
    { key: 'grocery', label: '生鮮' }, // grocery
    { key: 'nutrition', label: '水果' }, // nutrition
  ] },
  { title: '交通', icons: [
    { key: 'bus', label: '公車' }, // directions_bus
    { key: 'train', label: '火車' }, // train
    { key: 'directions_subway', label: '捷運' }, // directions_subway
    { key: 'directions_car', label: '汽車' }, // directions_car
    { key: 'local_taxi', label: '計程車' }, // local_taxi
    { key: 'two_wheeler', label: '機車' }, // two_wheeler
    { key: 'local_gas_station', label: '加油' }, // local_gas_station
    { key: 'local_parking', label: '停車' }, // local_parking
  ] },
  { title: '居家與帳單', icons: [
    { key: 'home', label: '居家' }, // cottage
    { key: 'apartment', label: '房租' }, // apartment
    { key: 'chair', label: '家具' }, // chair
    { key: 'water_drop', label: '水費' }, // water_drop
    { key: 'bolt', label: '電費' }, // bolt
    { key: 'local_fire_department', label: '瓦斯' }, // local_fire_department
    { key: 'wifi', label: '網路' }, // wifi
    { key: 'mobile', label: '電話費' }, // mobile
    { key: 'cleaning_services', label: '清潔' }, // cleaning_services
    { key: 'build', label: '修繕' }, // build
  ] },
  { title: '購物與 3C', icons: [
    { key: 'shopping', label: '購物' }, // local_mall
    { key: 'otherExpense', label: '購物車' }, // shopping_cart
    { key: 'checkroom', label: '服飾' }, // checkroom
    { key: 'package_2', label: '網購' }, // package_2
    { key: 'laptop_mac', label: '電腦' }, // laptop_mac
    { key: 'devices', label: '3C' }, // devices
  ] },
  { title: '美容與健康', icons: [
    { key: 'content_cut', label: '美髮' }, // content_cut
    { key: 'spa', label: '美容' }, // spa
    { key: 'diamond', label: '飾品' }, // diamond
    { key: 'medical', label: '醫療' }, // mixture_med
    { key: 'medication', label: '藥品' }, // medication
    { key: 'local_hospital', label: '醫院' }, // local_hospital
    { key: 'dentistry', label: '牙醫' }, // dentistry
    { key: 'fitness_center', label: '健身' }, // fitness_center
  ] },
  { title: '娛樂與訂閱', icons: [
    { key: 'entertainment', label: '遊戲' }, // stadia_controller
    { key: 'movie', label: '電影' }, // movie
    { key: 'music_note', label: '音樂' }, // music_note
    { key: 'live_tv', label: '影音訂閱' }, // live_tv
    { key: 'menu_book', label: '書籍' }, // menu_book
    { key: 'hiking', label: '戶外' }, // hiking
  ] },
  { title: '旅遊', icons: [
    { key: 'flight', label: '機票' }, // flight
    { key: 'luggage', label: '旅行' }, // luggage
    { key: 'hotel', label: '住宿' }, // hotel
  ] },
  { title: '家人與寵物', icons: [
    { key: 'pets', label: '寵物' }, // pets
    { key: 'child_care', label: '育兒' }, // child_care
    { key: 'stroller', label: '嬰兒用品' }, // stroller
    { key: 'elderly', label: '孝親' }, // elderly
    { key: 'favorite', label: '約會' }, // favorite
  ] },
  { title: '學習與工作', icons: [
    { key: 'learn', label: '學習' }, // school
    { key: 'auto_stories', label: '課程' }, // auto_stories
    { key: 'work', label: '工作' }, // work
    { key: 'handshake', label: '應酬' }, // handshake
  ] },
  { title: '保險與稅費', icons: [
    { key: 'shield', label: '保險' }, // shield
    { key: 'health_and_safety', label: '健保' }, // health_and_safety
    { key: 'receipt_long', label: '稅費' }, // receipt_long
    { key: 'account_balance', label: '銀行' }, // account_balance
  ] },
  { title: '人情', icons: [
    { key: 'gift', label: '送禮' }, // redeem
    { key: 'celebration', label: '慶祝' }, // celebration
    { key: 'cake', label: '生日' }, // cake
    { key: 'volunteer_activism', label: '紅包' }, // volunteer_activism
    { key: 'donate', label: '捐贈' }, // real_estate_agent
  ] },
  { title: '收入與理財', icons: [
    { key: 'salary', label: '薪水' }, // money_bag
    { key: 'workspace_premium', label: '獎金' }, // workspace_premium
    { key: 'payments', label: '現金' }, // payments
    { key: 'redeem', label: '回饋' }, // add_card
    { key: 'percent', label: '利息' }, // percent
    { key: 'savings', label: '儲蓄' }, // savings
    { key: 'invest', label: '投資' }, // currency_exchange
    { key: 'stock', label: '股票' }, // finance_mode
    { key: 'trending_up', label: '收益' }, // trending_up
    { key: 'sell', label: '二手拍' }, // sell
    { key: 'otherIncome', label: '其他收入' }, // payment_arrow_down
  ] },
]

export const CATEGORY_ICON_KEYS = new Set(CATEGORY_ICON_GROUPS.flatMap((g) => g.icons.map((i) => i.key)))

const LABELS = new Map(CATEGORY_ICON_GROUPS.flatMap((g) => g.icons.map((i) => [i.key, i.label])))
/** 圖示的中文名稱（給 aria-label、提示用） */
export const iconLabel = (key) => LABELS.get(key) ?? key
