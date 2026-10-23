/**
 * History
 * - undo / redo 스택. HTML 스냅샷 방식(단순·안정적).
 * - 연속 타이핑은 debounce 로 묶어서 한 단계로 기록한다.
 */
export class History {
  /**
   * @param {() => string} getState  현재 HTML 반환 함수
   * @param {(html: string) => void} setState HTML 복원 함수
   * @param {number} limit 최대 보관 개수
   */
  constructor(getState, setState, limit = 100) {
    this.getState = getState;
    this.setState = setState;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.timer = null;
    this.last = getState(); // 마지막으로 기록된 상태
  }

  /** 즉시 스냅샷 기록 (서식 적용 등 명시적 동작 후 호출) */
  push() {
    clearTimeout(this.timer);
    const cur = this.getState();
    if (cur === this.last) return;
    this.undoStack.push(this.last);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.last = cur;
  }

  /**
   * 사용자 동작이 아닌 자동 보정(지도 장소명 채우기 등)을 마지막 상태에 덮어쓴다.
   * 되돌리기 단계를 만들지 않고 redo 도 지우지 않는다.
   */
  amend() {
    this.last = this.getState();
  }

  /** 타이핑용 지연 기록 (input 이벤트마다 호출) */
  pushDebounced(delay = 400) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), delay);
  }

  undo() {
    this.push(); // 미기록 타이핑이 있으면 먼저 반영
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.last);
    this.last = this.undoStack.pop();
    this.setState(this.last);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.last);
    this.last = this.redoStack.pop();
    this.setState(this.last);
  }
}
