/**
 * settings-panel.js
 * 设置面板生成器
 * 
 * 从schema自动生成设置UI
 */

class SettingsPanelGenerator {
  /**
   * 从schema生成设置面板
   * @param {object} schema - settingsSchema
   * @param {object} currentValues - 当前设置值
   * @param {Function} onChange - 设置变更回调
   * @returns {HTMLElement}
   */
  static generate(schema, currentValues = {}, onChange = null) {
    const panel = document.createElement('div');
    panel.className = 'theme-settings-panel';
    panel.style.cssText = `
      padding: 16px;
      background: var(--surface, #2a2a2a);
      border-radius: 8px;
      border: 1px solid var(--border, #3a3a3a);
    `;
    
    // 标题
    const title = document.createElement('h3');
    title.textContent = '主题设置';
    title.style.cssText = `
      margin: 0 0 16px 0;
      color: var(--text, #e0e0e0);
      font-size: 16px;
    `;
    panel.appendChild(title);
    
    // 生成字段
    for (const [key, prop] of Object.entries(schema.properties)) {
      const field = this.createField(key, prop, currentValues[key], onChange);
      panel.appendChild(field);
    }
    
    return panel;
  }

  /**
   * 创建单个字段
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createField(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-field';
    wrapper.style.cssText = `
      margin-bottom: 12px;
    `;
    
    // 标签
    const label = document.createElement('label');
    label.textContent = prop.title || key;
    label.style.cssText = `
      display: block;
      margin-bottom: 4px;
      color: var(--text-dim, #888);
      font-size: 12px;
    `;
    wrapper.appendChild(label);
    
    // 输入控件
    let input;
    switch (prop.type) {
      case 'string':
        if (prop.format === 'color') {
          input = this.createColorInput(key, prop, value, onChange);
        } else {
          input = this.createTextInput(key, prop, value, onChange);
        }
        break;
      case 'number':
        input = this.createNumberInput(key, prop, value, onChange);
        break;
      case 'boolean':
        input = this.createCheckboxInput(key, prop, value, onChange);
        break;
      default:
        input = this.createTextInput(key, prop, value, onChange);
    }
    
    wrapper.appendChild(input);
    
    return wrapper;
  }

  /**
   * 创建颜色输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createColorInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value ?? prop.default ?? '#000000';
    input.style.cssText = `
      width: 32px;
      height: 32px;
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      cursor: pointer;
    `;
    
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = value ?? prop.default ?? '#000000';
    hexInput.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      background: var(--bg, #1a1a1a);
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    // 同步颜色选择器和文本输入
    input.addEventListener('input', (e) => {
      hexInput.value = e.target.value;
      if (onChange) {
        onChange(key, e.target.value);
      }
    });
    
    hexInput.addEventListener('change', (e) => {
      const hex = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        input.value = hex;
        if (onChange) {
          onChange(key, hex);
        }
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(hexInput);
    
    return wrapper;
  }

  /**
   * 创建文本输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createTextInput(key, prop, value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? prop.default ?? '';
    input.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: var(--bg, #1a1a1a);
      border: 1px solid var(--border, #3a3a3a);
      border-radius: 4px;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('change', (e) => {
      if (onChange) {
        onChange(key, e.target.value);
      }
    });
    
    return input;
  }

  /**
   * 创建数字输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createNumberInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = prop.minimum ?? 0;
    input.max = prop.maximum ?? 100;
    input.step = prop.step ?? 1;
    input.value = value ?? prop.default ?? 0;
    input.style.cssText = `
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: var(--border, #3a3a3a);
      border-radius: 2px;
      outline: none;
    `;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = input.value;
    valueDisplay.style.cssText = `
      min-width: 30px;
      text-align: right;
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('input', (e) => {
      valueDisplay.textContent = e.target.value;
      if (onChange) {
        onChange(key, parseFloat(e.target.value));
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(valueDisplay);
    
    return wrapper;
  }

  /**
   * 创建复选框输入
   * @param {string} key
   * @param {object} prop
   * @param {*} value
   * @param {Function} onChange
   * @returns {HTMLElement}
   */
  static createCheckboxInput(key, prop, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value ?? prop.default ?? false;
    input.style.cssText = `
      width: 16px;
      height: 16px;
      cursor: pointer;
    `;
    
    const label = document.createElement('span');
    label.textContent = input.checked ? '开启' : '关闭';
    label.style.cssText = `
      color: var(--text, #e0e0e0);
      font-size: 12px;
    `;
    
    input.addEventListener('change', (e) => {
      label.textContent = e.target.checked ? '开启' : '关闭';
      if (onChange) {
        onChange(key, e.target.checked);
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(label);
    
    return wrapper;
  }

  /**
   * 收集设置值
   * @param {HTMLElement} panel
   * @param {object} schema
   * @returns {object}
   */
  static collectValues(panel, schema) {
    const values = {};
    
    for (const [key, prop] of Object.entries(schema.properties)) {
      const field = panel.querySelector(`[data-key="${key}"]`);
      if (!field) continue;
      
      switch (prop.type) {
        case 'string':
          if (prop.format === 'color') {
            values[key] = field.value;
          } else {
            values[key] = field.value;
          }
          break;
        case 'number':
          values[key] = parseFloat(field.value);
          break;
        case 'boolean':
          values[key] = field.checked;
          break;
      }
    }
    
    return values;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsPanelGenerator;
} else if (typeof window !== 'undefined') {
  window.SettingsPanelGenerator = SettingsPanelGenerator;
}