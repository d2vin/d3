/** Position art and its percentage-based hotspots together in the viewport. */
export function sceneLayout(
  viewWidth,
  viewHeight,
  ratio,
  fit = false,
  pan = 0,
) {
  const positive = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  viewWidth = positive(viewWidth, 1);
  viewHeight = positive(viewHeight, 1);
  ratio = positive(ratio, 1);

  const useWidth = fit
    ? viewWidth / viewHeight < ratio
    : viewWidth / viewHeight > ratio;
  const width = useWidth ? viewWidth : viewHeight * ratio;
  const height = useWidth ? viewWidth / ratio : viewHeight;
  const maxPan = Math.max(0, (width - viewWidth) / 2);
  const minPan = maxPan ? -maxPan : 0;
  pan = Math.min(maxPan, Math.max(minPan, Number.isFinite(pan) ? pan : 0));

  return {
    width,
    height,
    left: (viewWidth - width) / 2 + pan,
    top: (viewHeight - height) / 2,
    minPan,
    maxPan,
    pan,
  };
}
