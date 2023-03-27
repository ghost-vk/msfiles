import { Subject } from 'rxjs';

import { ImageConversionPayload, VideoConversionPayload } from './types';

export const videoConversion$ = new Subject<VideoConversionPayload>();

export const imageConversion$ = new Subject<ImageConversionPayload>();
