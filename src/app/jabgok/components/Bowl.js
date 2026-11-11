import { h } from '../../../lib/index.js';
import { BOWL, LABEL } from '../config.js';
import { bowlBox } from '../logic/world.js';
import { translate } from './format.js';

/**
 * 그릇 단면. 옆벽과 바닥만 테두리로 그리고 위는 열려 있다. (SVG가 범위 밖이라 div + border-radius)
 * 왼쪽 그릇(잡곡 그릇)은 bowl을 받아 그 자리에 그리고, 아래에 "잡곡 그릇" 이름표를 단다.
 * 그릇은 이 글자 중 "곡"의 ㅗ 꼭지만 잡을 수 있다(숨은 꼼수라 화면에는 표시하지 않는다). 위치는 transform 하나로 정한다.
 * @param {{side: 'left'|'right', bowl?: {x: number, y: number, held: boolean}}} props
 */
export function Bowl({ side, bowl }) {
  const box = bowlBox(side, bowl);
  return h(
    'div',
    {
      class: `bowl bowl--${side}${bowl?.held ? ' is-held' : ''}`,
      style:
        `width: ${BOWL.width}px; height: ${BOWL.height}px; border-width: 0 ${BOWL.wall}px ${BOWL.wall}px; ` +
        translate(box.outerLeft, box.rimY),
    },
    bowl &&
      h(
        'div',
        {
          class: 'bowl__label',
          style: `width: ${LABEL.width}px; height: ${LABEL.height}px; margin-left: ${-LABEL.width / 2}px`,
        },
        LABEL.text,
      ),
  );
}
