// Design tokens — programmatic access for non-className use (Animated, shadows, charts)
export const palette = {
  sage: { 50:'#EEF7F2',100:'#D5EDE0',200:'#ADDBC4',300:'#7DC4A1',400:'#4FAC82',
          500:'#2E9C6A',600:'#248057',700:'#1E6646',800:'#1A5039',900:'#15402E' },
} as const;

export const radius = { xs:6, sm:10, md:14, lg:18, xl:22, '2xl':26, pill:999 } as const;

export const spacing = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40 } as const;

export const shadow = {
  sh1:  { shadowColor:'#142B1E', shadowOffset:{width:0,height:1}, shadowOpacity:0.06,
          shadowRadius:2, elevation:1 },
  sh2:  { shadowColor:'#142B1E', shadowOffset:{width:0,height:8}, shadowOpacity:0.10,
          shadowRadius:24, elevation:4 },
  fab:  { shadowColor:'#2E9C6A', shadowOffset:{width:0,height:10}, shadowOpacity:0.36,
          shadowRadius:24, elevation:10 },
  hero: { shadowColor:'#1E6646', shadowOffset:{width:0,height:12}, shadowOpacity:0.18,
          shadowRadius:32, elevation:6 },
} as const;

export const duration = { fast:120, base:180, slow:260 } as const;
