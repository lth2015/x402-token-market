export async function slide01(presentation, ctx) {
 const slide = presentation.slides.add();
 slide.background.fill = '#0B1020';
 const r = slide.shapes.add({ geometry: 'rect', x: 80, y: 80, width: 500, height: 140 });
 r.fill = '#16213E';
 r.line = { fill: '#38BDF8', width: 2 };
 r.text.set('Hello 商业逻辑');
 r.text.fontSize = 42;
 r.text.color = '#FFFFFF';
 return slide;
}
