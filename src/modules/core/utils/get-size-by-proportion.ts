import * as Joi from 'joi';

import { Size } from '../types';

export type GetSizeByProportionParams = {
  targetWidth?: number;
  targetHeight?: number;
  originWidth?: number;
  originHeight?: number;
  targetProportion?: number;
  onlyEven?: boolean;
};

const validationSchema = Joi.object<GetSizeByProportionParams>({
  targetWidth: Joi.number().integer().positive().optional(),
  targetHeight: Joi.number().integer().positive().optional(),
  originWidth: Joi.number().integer().positive().optional(),
  originHeight: Joi.number().integer().positive().optional(),
  targetProportion: Joi.number().positive().optional(),
  onlyEven: Joi.boolean().optional(),
});

export const getSizeByProportion = (params: GetSizeByProportionParams = { onlyEven: true }): Size => {
  validationSchema.validate(params);

  if (!params.targetHeight && !params.targetWidth) throw new Error('Target size not defined.');

  let width: number;
  let height: number;

  const proportion = params.targetProportion
    ? params.targetProportion
    : params.originWidth && params.originHeight
    ? params.originWidth / params.originHeight
    : -1;

  if (proportion === -1) {
    throw new Error('Not enough data to calc size. Pass targetProportion or originHeight with originWidth.');
  }

  if (params.targetWidth) {
    width = params.targetWidth;
    height = Math.floor(params.targetWidth / proportion);
  }

  if (params.targetHeight) {
    height = params.targetHeight;
    width = Math.floor(params.targetHeight * proportion);
  }

  if (params.onlyEven) {
    // На этом моменте height и width однозначно определены
    width = Math.floor(width! / 2) * 2;
    height = Math.floor(height! / 2) * 2;
  }

  // На этом моменте height и width однозначно определены
  return { width: width!, height: height! };
};
