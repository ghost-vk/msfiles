import { getSizeByProportion } from './get-size-by-proportion';

describe('Utility function: getSizeByProportion.', () => {
  it('Should return size based on original width [1920], height [1080] proportion, and target width [1280].', () => {
    const size = getSizeByProportion({
      originHeight: 1080,
      originWidth: 1920,
      targetWidth: 1280,
    });

    expect(size).toEqual(
      expect.objectContaining({
        width: 1280,
        height: 720
      }),
    );
  })

  it('Should return size based on original width [1920], height [1080] proportion, and target height [720].', () => {
    const size = getSizeByProportion({
      originHeight: 1080,
      originWidth: 1920,
      targetHeight: 720,
    });

    expect(size).toEqual(
      expect.objectContaining({
        width: 1280,
        height: 720
      }),
    );
  })

  it('Should return size based on proportion [1.4], and target height [1000].', () => {
    const size = getSizeByProportion({
      targetProportion: 1.4,
      targetHeight: 1000,
    });

    expect(size).toEqual(
      expect.objectContaining({
        width: 1400,
        height: 1000
      }),
    );
  })
})
