// Draws the app's icons from the Karma "K" mark, as vector shapes so every size is sharp.
//
//   cd expo_app/assets/brand && swift render-icons.swift
//
// writes out-icon.png (iOS, no transparency), out-adaptive-icon.png (Android foreground),
// out-splash-icon.png and out-favicon.png; copy them over the files in ../images.
import AppKit
// K mark traced from the Karma logo, in a 896 x 1344 design grid (y grows downward).
func kStemAndArrow() -> NSBezierPath {
  let p = NSBezierPath()
  p.move(to: .init(x: 0, y: 165)); p.line(to: .init(x: 295, y: 165)); p.line(to: .init(x: 295, y: 470))
  p.curve(to: .init(x: 530, y: 320), controlPoint1: .init(x: 400, y: 450), controlPoint2: .init(x: 480, y: 400))
  p.curve(to: .init(x: 578, y: 150), controlPoint1: .init(x: 560, y: 270), controlPoint2: .init(x: 575, y: 210))
  p.line(to: .init(x: 545, y: 150)); p.line(to: .init(x: 725, y: 0)); p.line(to: .init(x: 896, y: 150)); p.line(to: .init(x: 870, y: 150))
  p.curve(to: .init(x: 720, y: 580), controlPoint1: .init(x: 870, y: 330), controlPoint2: .init(x: 820, y: 480))
  p.curve(to: .init(x: 295, y: 725), controlPoint1: .init(x: 640, y: 660), controlPoint2: .init(x: 520, y: 710))
  p.line(to: .init(x: 295, y: 1344)); p.line(to: .init(x: 0, y: 1344)); p.close(); return p
}
func kNotch() -> NSBezierPath {
  let p = NSBezierPath(); p.move(to: .init(x: 297, y: 742)); p.line(to: .init(x: 118, y: 905)); p.line(to: .init(x: 297, y: 1072)); p.close(); return p
}
func kLeg() -> NSBezierPath {
  let p = NSBezierPath(); p.move(to: .init(x: 318, y: 760))
  p.curve(to: .init(x: 800, y: 1020), controlPoint1: .init(x: 520, y: 780), controlPoint2: .init(x: 700, y: 880))
  p.curve(to: .init(x: 882, y: 1344), controlPoint1: .init(x: 860, y: 1110), controlPoint2: .init(x: 880, y: 1230))
  p.line(to: .init(x: 592, y: 1344))
  p.curve(to: .init(x: 470, y: 1110), controlPoint1: .init(x: 580, y: 1250), controlPoint2: .init(x: 540, y: 1170))
  p.curve(to: .init(x: 318, y: 1050), controlPoint1: .init(x: 420, y: 1070), controlPoint2: .init(x: 370, y: 1055))
  p.close(); return p
}
func hex(_ h: UInt32) -> NSColor { NSColor(srgbRed: CGFloat((h>>16)&0xff)/255, green: CGFloat((h>>8)&0xff)/255, blue: CGFloat(h&0xff)/255, alpha: 1) }

func render(_ name: String, bg: NSColor, fg: NSColor, size: Int, markHeight: CGFloat) {
  let cg = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                     space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  NSGraphicsContext.saveGraphicsState()
  let ctx = NSGraphicsContext(cgContext: cg, flipped: false); NSGraphicsContext.current = ctx
  ctx.shouldAntialias = true
  bg.setFill(); NSRect(x: 0, y: 0, width: size, height: size).fill()
  let s = markHeight / 1344, w = 896 * s
  let t = NSAffineTransform()
  // flip to the design grid's downward y, then centre the mark (optically nudged left: the arrow reaches right)
  t.translateX(by: (CGFloat(size) - w) / 2 + CGFloat(size) * 0.01, yBy: (CGFloat(size) + markHeight) / 2)
  t.scaleX(by: s, yBy: -s)
  for (path, color) in [(kStemAndArrow(), fg), (kNotch(), bg), (kLeg(), fg)] { path.transform(using: t as AffineTransform); color.setFill(); path.fill() }
  NSGraphicsContext.restoreGraphicsState()
  let rep = NSBitmapImageRep(cgImage: cg.makeImage()!)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: name))
}
func renderTransparent(_ name: String, fg: NSColor, size: Int, markHeight: CGFloat) {
  let cg = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                     space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  NSGraphicsContext.saveGraphicsState()
  let ctx = NSGraphicsContext(cgContext: cg, flipped: false); NSGraphicsContext.current = ctx
  let s = markHeight / 1344, w = 896 * s
  let t = NSAffineTransform()
  t.translateX(by: (CGFloat(size) - w) / 2 + CGFloat(size) * 0.01, yBy: (CGFloat(size) + markHeight) / 2)
  t.scaleX(by: s, yBy: -s)
  let stem = kStemAndArrow(), notch = kNotch(), leg = kLeg()
  for p in [stem, notch, leg] { p.transform(using: t as AffineTransform) }
  fg.setFill(); stem.fill()
  ctx.compositingOperation = .clear; notch.fill()
  ctx.compositingOperation = .sourceOver; fg.setFill(); leg.fill()
  NSGraphicsContext.restoreGraphicsState()
  try! NSBitmapImageRep(cgImage: cg.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: name))
}
let red = hex(0xC8483A), white = hex(0xFFFFFF)
render("out-icon.png", bg: white, fg: red, size: 1024, markHeight: 620)
// Android crops the adaptive foreground to a circle or squircle inside the middle ~66%, so the mark is smaller
renderTransparent("out-adaptive-icon.png", fg: red, size: 1024, markHeight: 440)
renderTransparent("out-splash-icon.png", fg: red, size: 1024, markHeight: 900)
render("out-favicon.png", bg: white, fg: red, size: 48, markHeight: 34)
print("ok")
