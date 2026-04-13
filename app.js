function animacaoPremium(){
  const overlay=document.createElement('div')
  overlay.className='ponto-overlay'
  overlay.innerHTML=`
    <div class="ponto-modal">
      <div class="ponto-check">✔</div>
      <div>Ponto registrado</div>
    </div>
  `
  document.body.appendChild(overlay)
  setTimeout(()=>overlay.remove(),2000)
}

function bater(){
  navigator.geolocation.getCurrentPosition(()=>{
    animacaoPremium()
  })
}