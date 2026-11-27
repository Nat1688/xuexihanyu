jest.mock('../src/config/public-config', () => ({
  getPublicConfig: () => ({ apiBaseUrl: '/api' }),
}));
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicationPanel } from '../src/dictionary/PublicationPanel';
import { Dictionary } from '../src/dictionary/Dictionary';
import { dictionaryError } from '../src/dictionary/client';
import { ApiError } from '../src/api/client';
describe('DICT07 Vietnamese group publication presentation', () => {
  const noop = () => undefined;
  it('advertises publication controls only in ADMIN management', () => {
    const admin = renderToStaticMarkup(<Dictionary mode="admin" onClose={noop} onExpired={noop} />);
    expect(admin).toContain('Xuất bản theo nhóm chuyên ngành');
    for (const mode of ['reference', 'specialties'] as const)
      expect(
        renderToStaticMarkup(<Dictionary mode={mode} onClose={noop} onExpired={noop} />),
      ).not.toContain('Xuất bản theo nhóm chuyên ngành');
  });
  it('requires choosing a specific group and disables actions while processing', () => {
    const html = renderToStaticMarkup(
      <PublicationPanel
        categories={[]}
        busy={true}
        setBusy={noop}
        onChanged={noop}
        onError={noop}
      />,
    );
    expect(html).toContain('Chọn một nhóm chuyên ngành');
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('Vui lòng giữ trang mở');
    expect(html).not.toContain('Xuất bản toàn bộ nhóm</button>');
  });
  it('explains unavailable publication without reflecting backend exceptions', () => {
    expect(
      dictionaryError(new ApiError(409, 'DICTIONARY_PUBLICATION_BLOCKED', 'SQL secret')),
    ).toContain('chưa đủ điều kiện');
    expect(
      dictionaryError(new ApiError(413, 'DICTIONARY_GROUP_TOO_LARGE', 'SQL secret')),
    ).toContain('25.000');
  });
});
