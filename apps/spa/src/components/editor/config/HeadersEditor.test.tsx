import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeadersEditor } from './HeadersEditor';

describe('HeadersEditor', () => {
  it('should render one empty row by default when no headers are provided', () => {
    render(<HeadersEditor value={{}} onChange={() => {}} />);
    expect(screen.getAllByPlaceholderText(/key/i)).toHaveLength(1);
    expect(screen.getAllByPlaceholderText(/value/i)).toHaveLength(1);
  });

  it('should render one row per existing header', () => {
    render(
      <HeadersEditor
        value={{ 'Content-Type': 'application/json', Authorization: 'Bearer xyz' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByPlaceholderText(/key/i)).toHaveLength(2);
    const values = screen.getAllByPlaceholderText(/value/i) as HTMLInputElement[];
    expect(values.map((v) => v.value)).toEqual(['application/json', 'Bearer xyz']);
  });

  it('should emit a Record with an added row when the user types a new key and value', () => {
    const onChange = vi.fn();
    render(<HeadersEditor value={{}} onChange={onChange} />);

    const [keyInput] = screen.getAllByPlaceholderText(/key/i);
    fireEvent.change(keyInput, { target: { value: 'X-Test' } });

    expect(onChange).toHaveBeenLastCalledWith({ 'X-Test': '' });

    const [valueInput] = screen.getAllByPlaceholderText(/value/i);
    fireEvent.change(valueInput, { target: { value: '42' } });

    expect(onChange).toHaveBeenLastCalledWith({ 'X-Test': '42' });
  });

  it('should append a new empty row when the user clicks Add header', () => {
    render(<HeadersEditor value={{ A: '1' }} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /add header/i }));
    expect(screen.getAllByPlaceholderText(/key/i)).toHaveLength(2);
  });

  it('should remove a row and emit the remaining headers when the user clicks Remove', () => {
    const onChange = vi.fn();
    render(<HeadersEditor value={{ A: '1', B: '2' }} onChange={onChange} />);

    const removeButtons = screen.getAllByRole('button', { name: /remove header/i });
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith({ B: '2' });
  });

  it('should omit rows with empty keys from the emitted record', () => {
    const onChange = vi.fn();
    render(<HeadersEditor value={{}} onChange={onChange} />);

    const [valueInput] = screen.getAllByPlaceholderText(/value/i);
    fireEvent.change(valueInput, { target: { value: 'orphan' } });

    expect(onChange).toHaveBeenLastCalledWith({});
  });
});
