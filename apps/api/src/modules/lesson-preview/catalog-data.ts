// Server-owned product content. LC-03A derivative revision; see LC-03B review notes.
export const rawCatalog = {
  packageId: 'lc03-lesson-01',
  revision: 'lc03b-preview-1',
  status: 'PREVIEW_ONLY',
  specialistSignoff: false,
  ownerPublication: false,
  targetLanguage: 'cmn',
  script: 'Hans',
  concepts: [
    {
      id: 'greeting',
      hanzi: '你好',
      pinyin: 'nǐ hǎo',
      gloss: {
        vi: 'xin chào',
        en: 'hello',
      },
    },
    {
      id: 'speaker',
      hanzi: '我',
      pinyin: 'wǒ',
      gloss: {
        vi: 'tôi/mình',
        en: 'I / me',
      },
    },
    {
      id: 'listener',
      hanzi: '你',
      pinyin: 'nǐ',
      gloss: {
        vi: 'bạn',
        en: 'you',
      },
    },
    {
      id: 'naming',
      hanzi: '叫',
      pinyin: 'jiào',
      gloss: {
        vi: 'tên là (mẫu giới thiệu)',
        en: 'be called (naming pattern)',
      },
    },
    {
      id: 'what',
      hanzi: '什么',
      pinyin: 'shénme',
      gloss: {
        vi: 'gì',
        en: 'what',
      },
    },
    {
      id: 'name',
      hanzi: '名字',
      pinyin: 'míngzi',
      gloss: {
        vi: 'tên',
        en: 'name',
      },
    },
    {
      id: 'role-link',
      hanzi: '是',
      pinyin: 'shì',
      gloss: {
        vi: 'là (trước danh từ vai trò)',
        en: 'be (before role noun)',
      },
    },
    {
      id: 'student',
      hanzi: '学生',
      pinyin: 'xuésheng',
      gloss: {
        vi: 'học sinh/sinh viên',
        en: 'student',
      },
    },
    {
      id: 'teacher',
      hanzi: '老师',
      pinyin: 'lǎoshī',
      gloss: {
        vi: 'giáo viên/thầy/cô',
        en: 'teacher',
      },
    },
    {
      id: 'ask-back',
      hanzi: '呢',
      pinyin: 'ne',
      gloss: {
        vi: 'còn… thì sao',
        en: 'and…?',
      },
    },
    {
      id: 'goodbye',
      hanzi: '再见',
      pinyin: 'zàijiàn',
      gloss: {
        vi: 'tạm biệt',
        en: 'goodbye',
      },
    },
  ],
  dialogue: [
    {
      speaker: 'A',
      hanzi: '你好！',
      pinyin: 'Nǐ hǎo!',
      translation: {
        vi: 'Chào bạn!',
        en: 'Hello!',
      },
    },
    {
      speaker: 'B',
      hanzi: '你好！你叫什么名字？',
      pinyin: 'Nǐ hǎo! Nǐ jiào shénme míngzi?',
      translation: {
        vi: 'Chào bạn! Bạn tên gì?',
        en: 'Hello! What is your name?',
      },
    },
    {
      speaker: 'A',
      hanzi: '我叫小明。你呢？',
      pinyin: 'Wǒ jiào Xiǎomíng. Nǐ ne?',
      translation: {
        vi: 'Mình tên Tiểu Minh. Còn bạn?',
        en: 'My name is Xiaoming. And you?',
      },
    },
    {
      speaker: 'B',
      hanzi: '我叫小美。我是学生。',
      pinyin: 'Wǒ jiào Xiǎoměi. Wǒ shì xuésheng.',
      translation: {
        vi: 'Mình tên Tiểu Mỹ. Mình là học sinh/sinh viên.',
        en: 'My name is Xiaomei. I am a student.',
      },
    },
    {
      speaker: 'A',
      hanzi: '我是老师。',
      pinyin: 'Wǒ shì lǎoshī.',
      translation: {
        vi: 'Mình là giáo viên.',
        en: 'I am a teacher.',
      },
    },
    {
      speaker: 'B',
      hanzi: '再见！',
      pinyin: 'Zàijiàn!',
      translation: {
        vi: 'Tạm biệt!',
        en: 'Goodbye!',
      },
    },
    {
      speaker: 'A',
      hanzi: '再见！',
      pinyin: 'Zàijiàn!',
      translation: {
        vi: 'Tạm biệt!',
        en: 'Goodbye!',
      },
    },
  ],
  variants: [
    {
      language: 'vi',
      variantId: 'lesson-01-vi',
      title: 'Chào hỏi và tự giới thiệu',
      notice: 'PREVIEW — nội dung chờ giáo viên chuyên môn duyệt. Tự luyện — chưa lưu tiến độ.',
      objectives: [
        'Chào và đáp lại lời chào; kết thúc cuộc gặp.',
        'Hỏi và trả lời tên tự chọn.',
        'Nói vai học viên/giáo viên theo thẻ.',
        'Phân biệt viết Pinyin với phát âm; nghe/nói cần giáo viên quan sát.',
      ],
      blocks: [
        {
          id: 'context',
          kind: 'explanation',
          title: 'Bắt đầu',
          text: 'Dùng tên tự chọn hoặc tên trên thẻ. 小明 và 小美 là tên hư cấu; vai giáo viên/học viên là role-play, không yêu cầu cung cấp tên thật.',
        },
        {
          id: 'pinyin',
          kind: 'pronunciationNote',
          title: 'Pinyin và thanh nối',
          text: 'Pinyin không đọc theo Quốc ngữ. Dấu từ điển của 你好 là nǐ hǎo; khi nói liền 3+3, âm tiết đầu lên (ghi chú cách đọc: ní hǎo). Trong wǒ jiào, dùng mẫu tự nhiên, không kéo thanh 3 thành một nét xuống–lên dài. Các âm nhẹ trong shénme, míngzi, xuésheng, ne theo chuẩn bài; không áp cho mọi từ.',
        },
        {
          id: 'grammar',
          kind: 'explanation',
          title: 'Tên và vai trò',
          text: '我叫 + tên diễn đạt “Tôi tên là…”, không thêm 是 trước 叫. 我是学生 / 我是老师 nói vai trò; không suy ra 是 đứng trước mọi từ miêu tả. 你叫什么名字？ hỏi tên; 你呢？ hỏi lại dựa vào câu trước.',
        },
        {
          id: 'mnemonic',
          kind: 'explanation',
          title: 'Liên hệ nghĩa',
          text: '学生 có thể gợi nhớ âm Hán Việt “học sinh”; Mandarin vẫn đọc xuésheng. Đây là mẹo tùy chọn, không thay Pinyin.',
        },
        {
          id: 'activity',
          kind: 'activity',
          title: 'Cùng giáo viên',
          text: 'Đổi thẻ tên/vai: chào, hỏi tên, đáp tên, nói vai và tạm biệt. Thử một vòng có thẻ câu rồi bỏ thẻ. 你好 không là lời chào duy nhất cho mọi quan hệ. Nghe/nói chưa được đánh giá nếu chưa có giáo viên quan sát.',
        },
      ],
    },
    {
      language: 'en',
      variantId: 'lesson-01-en',
      title: 'Greetings and self-introduction',
      notice: 'PREVIEW — awaiting language-specialist review. Practice — progress is not saved.',
      objectives: [
        'Greet, respond and close an encounter.',
        'Ask and answer a chosen name.',
        'State a student/teacher role from a card.',
        'Distinguish Pinyin notation from speech; listening/speaking requires teacher observation.',
      ],
      blocks: [
        {
          id: 'context',
          kind: 'explanation',
          title: 'Getting started',
          text: 'Choose a name or use a role card. 小明 and 小美 are fictional names. Roles are for practice; you do not need to share your legal name. English is the instruction language, not an assumed first language.',
        },
        {
          id: 'pinyin',
          kind: 'pronunciationNote',
          title: 'Pinyin and connected speech',
          text: "Pinyin is not English spelling. Write dictionary nǐ hǎo; when spoken together, the first of the two third tones rises (speech note: ní hǎo). Model wǒ jiào naturally without an exaggerated full dip-and-rise. The neutral syllables in shénme, míngzi, xuésheng and ne follow this lesson's target; do not generalize to every word.",
        },
        {
          id: 'grammar',
          kind: 'explanation',
          title: 'Names and roles',
          text: 'Use 我叫 + name; do not insert 是 because English “My name is…” uses “is”. Use 我是 + role noun. This is not a rule for every predicate. 什么 stays in 你叫什么名字？; do not add English do-support. 你呢？ asks back in this context.',
        },
        {
          id: 'support',
          kind: 'explanation',
          title: 'Use the meaning',
          text: 'Use speaker gestures and role cards. You do not need to explain grammar in advanced English. Tell the teacher if a picture or demonstration helps.',
        },
        {
          id: 'activity',
          kind: 'activity',
          title: 'With your teacher',
          text: "Change name/role cards: greet, exchange names, state a role and say goodbye. First use sentence cards, then remove them. 你好 is not the only greeting for every relationship. Speaking/listening is not assessed without a teacher's observation.",
        },
      ],
    },
  ],
  tasks: [
    {
      id: 'P1',
      conceptId: 'greeting',
      field: 'simplified',
      format: 'CHOICE',
      options: ['学生', '你好', '再见'],
      expected: '你好',
      prompt: {
        vi: 'Vừa gặp bạn học. Chọn lời chào mở đầu.',
        en: 'You meet a classmate. Choose the opening greeting.',
      },
      correct: {
        vi: 'Đúng: dùng 你好 để mở đầu cuộc gặp trong bài.',
        en: 'Correct: use 你好 to open this encounter.',
      },
      incorrect: {
        vi: 'Phân biệt lời mở đầu và tạm biệt; thử lại với 你好.',
        en: 'Distinguish opening from goodbye; try 你好.',
      },
    },
    {
      id: 'P3',
      conceptId: 'role-link',
      field: 'simplified',
      format: 'TEXT',
      options: null,
      expected: '是',
      prompt: {
        vi: 'Vai học viên. Điền một chữ: 我___学生',
        en: 'Role: student. Complete with one character: 我___学生',
      },
      correct: {
        vi: 'Đúng: 我是学生 nói vai trò.',
        en: 'Correct: 我是学生 states the role.',
      },
      incorrect: {
        vi: 'Đây là vai trò, không phải tên: dùng 是.',
        en: 'This is a role, not a name: use 是.',
      },
    },
    {
      id: 'P5',
      conceptId: 'greeting',
      field: 'pinyin',
      format: 'TEXT',
      options: null,
      expected: 'nǐ hǎo',
      prompt: {
        vi: 'Viết Pinyin từ điển của 你好, có dấu thanh.',
        en: 'Write dictionary Pinyin for 你好 with tone marks.',
      },
      correct: {
        vi: 'Đúng về ký âm. Bài gõ không đánh giá phát âm.',
        en: 'Correct notation. Typing does not assess your voice.',
      },
      incorrect: {
        vi: 'Dùng dấu từ điển nǐ hǎo. ní hǎo là ghi chú cách nói nối; ni3 hao3 không được chuyển đổi ở bài này.',
        en: 'Use dictionary nǐ hǎo. ní hǎo describes connected speech; this task does not convert ni3 hao3.',
      },
    },
  ],
} as const;
