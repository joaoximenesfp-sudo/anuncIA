/* Temas por data comemorativa — usados pelo app (index.html) e pela vitrine
 * (catalogo.html). Um arquivo só de propósito: duas listas de datas viravam
 * duas verdades, e na virada de ano uma delas ficaria pra trás.
 *
 * A régua aqui é discrição. Catálogo é venda de confiança: página coberta de
 * enfeite parece loja improvisada e atrapalha justamente o que a gente quer
 * transmitir. Então o tema é uma faixa fina com uma frase e um degradê — nada
 * de neve caindo nem fundo trocado.
 */
(function(g){
  'use strict';

  // ── datas móveis ──────────────────────────────────────────────────────
  // Páscoa pelo algoritmo de Meeus/Butcher; o carnaval cai 47 dias antes.
  function pascoa(ano){
    const a=ano%19, b=Math.floor(ano/100), c=ano%100;
    const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
    const gg=Math.floor((b-f+1)/3), h=(19*a+b-d-gg+15)%30;
    const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7;
    const m=Math.floor((a+11*h+22*l)/451);
    const mes=Math.floor((h+l-7*m+114)/31), dia=((h+l-7*m+114)%31)+1;
    return new Date(ano, mes-1, dia);
  }
  function maisDias(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function carnaval(ano){ return maisDias(pascoa(ano),-47); }

  // n-ésimo dia da semana do mês (2º domingo de maio = enésimo(ano,5,0,2))
  function enesimo(ano, mes, diaSemana, n){
    const d=new Date(ano, mes-1, 1);
    const salto=(diaSemana-d.getDay()+7)%7;
    return new Date(ano, mes-1, 1+salto+(n-1)*7);
  }
  // última ocorrência de um dia da semana no mês (Black Friday = última sexta)
  function ultimo(ano, mes, diaSemana){
    const d=new Date(ano, mes, 0);            // último dia do mês
    return new Date(ano, mes-1, d.getDate()-((d.getDay()-diaSemana+7)%7));
  }

  const dia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fixa = (ano,mes,d) => new Date(ano, mes-1, d);

  // ── as datas ──────────────────────────────────────────────────────────
  // `janela(ano)` devolve [começo, fim] inclusivos. Quando duas se cruzam,
  // vence a de janela mais curta: a mais específica é a que a pessoa está
  // vivendo naquele dia.
  const DATAS=[
    { id:'ano-novo', emoji:'🎆', nome:'Ano Novo',
      frase:'Feliz Ano Novo! Que 2026 comece com a máquina certa.',
      cor1:'#1e3a8a', cor2:'#7c3aed',
      janela:a=>[fixa(a-1,12,26), fixa(a,1,4)] },

    { id:'volta-aulas', emoji:'📚', nome:'Volta às aulas',
      frase:'Volta às aulas: máquina que aguenta trabalho e faculdade sem travar.',
      cor1:'#1d4ed8', cor2:'#0891b2',
      janela:a=>[fixa(a,1,5), fixa(a,2,28)] },

    { id:'carnaval', emoji:'🎭', nome:'Carnaval',
      frase:'Bom carnaval! Respondo as mensagens assim que a folia passar.',
      cor1:'#7c3aed', cor2:'#f59e0b',
      janela:a=>[maisDias(carnaval(a),-4), maisDias(carnaval(a),1)] },

    { id:'maes', emoji:'💐', nome:'Dia das Mães',
      frase:'Dia das Mães: presente que serve o ano inteiro.',
      cor1:'#be185d', cor2:'#f472b6',
      janela:a=>[maisDias(enesimo(a,5,0,2),-12), enesimo(a,5,0,2)] },

    { id:'junina', emoji:'🎉', nome:'Festa Junina',
      frase:'Arraiá chegou! Bom São João pra você.',
      cor1:'#c2410c', cor2:'#eab308',
      janela:a=>[fixa(a,6,10), fixa(a,6,29)] },

    { id:'volta-aulas-2', emoji:'📖', nome:'Volta às aulas',
      frase:'Segundo semestre começando: hora de trocar aquela máquina lenta.',
      cor1:'#0f766e', cor2:'#0891b2',
      janela:a=>[fixa(a,7,15), fixa(a,8,3)] },

    { id:'pais', emoji:'👔', nome:'Dia dos Pais',
      frase:'Dia dos Pais: presente que ele vai usar todo dia.',
      cor1:'#1e3a8a', cor2:'#0e7490',
      janela:a=>[maisDias(enesimo(a,8,0,2),-12), enesimo(a,8,0,2)] },

    { id:'cliente', emoji:'🤝', nome:'Dia do Cliente',
      frase:'Semana do Cliente: obrigado por confiar na gente.',
      cor1:'#065f46', cor2:'#00b368',
      janela:a=>[fixa(a,9,10), fixa(a,9,16)] },

    { id:'criancas', emoji:'🧒', nome:'Dia das Crianças',
      frase:'Dia das Crianças: a primeira máquina deles pode ser boa e caber no bolso.',
      cor1:'#b45309', cor2:'#f59e0b',
      janela:a=>[fixa(a,10,5), fixa(a,10,13)] },

    { id:'black-friday', emoji:'🔥', nome:'Black Friday',
      frase:'Black Friday: preços revisados, sem preço inventado pra depois riscar.',
      cor1:'#111827', cor2:'#dc2626',
      janela:a=>[maisDias(ultimo(a,11,5),-6), maisDias(ultimo(a,11,5),3)] },

    { id:'natal', emoji:'🎄', nome:'Natal',
      frase:'Boas festas! Entrega combinada até o dia 23.',
      cor1:'#166534', cor2:'#dc2626',
      janela:a=>[fixa(a,12,1), fixa(a,12,25)] },
  ];

  // Quantos dias a janela cobre — o desempate.
  function tamanho(t, ano){
    const [ini,fim]=t.janela(ano);
    return Math.round((dia(fim)-dia(ini))/86400000);
  }

  // Tema do dia, ou null. Recebe a data pra poder ser testado sem esperar
  // dezembro chegar.
  function temaDe(quando){
    const hoje=dia(quando||new Date());
    const ano=hoje.getFullYear();
    const candidatos=[];
    // O ano seguinte também é consultado porque a janela do Ano Novo começa
    // em dezembro do ano anterior.
    [ano, ano+1].forEach(a=>{
      DATAS.forEach(t=>{
        const [ini,fim]=t.janela(a);
        if(hoje>=dia(ini) && hoje<=dia(fim)) candidatos.push({t, n:tamanho(t,a)});
      });
    });
    if(!candidatos.length) return null;
    candidatos.sort((x,y)=>x.n-y.n);
    const {t}=candidatos[0];
    return {id:t.id, emoji:t.emoji, nome:t.nome, frase:t.frase, cor1:t.cor1, cor2:t.cor2};
  }

  // Faixa fina. Devolve '' quando não há data — assim quem chama não precisa
  // decidir nada, e página sem tema fica exatamente como era.
  function temaFaixaHTML(tema){
    if(!tema) return '';
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="tema-faixa" style="background:linear-gradient(90deg,${tema.cor1},${tema.cor2})">`
         + `<span class="tema-emoji">${tema.emoji}</span> ${esc(tema.frase)}</div>`;
  }

  const TEMA_CSS=
    '.tema-faixa{color:#fff;font-size:.79rem;font-weight:600;line-height:1.5;'
    +'padding:9px 14px;text-align:center;letter-spacing:.01em}'
    +'.tema-faixa .tema-emoji{font-size:.95rem;margin-right:2px}';

  g.Tema={ temaDe, temaFaixaHTML, TEMA_CSS, DATAS,
           _interno:{pascoa, carnaval, enesimo, ultimo} };
})(typeof window!=='undefined'?window:globalThis);

if(typeof module!=='undefined') module.exports=(typeof window!=='undefined'?window:globalThis).Tema;
