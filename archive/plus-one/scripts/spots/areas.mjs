// Nightlife district anchors used to spread each shortlist across the city.
// The administrative relation controls the full extract boundary.
export const areas = {
  berlin: { relation: 62422, districts: [
    [52.524, 13.402], // Mitte
    [52.513, 13.455], // Friedrichshain
    [52.501, 13.429], // Kreuzberg
    [52.486, 13.428], // Neukölln
    [52.539, 13.412], // Prenzlauer Berg
    [52.502, 13.354], // Schöneberg
  ] },
  hamburg: { relation: 62782, districts: [
    [53.550, 9.958], // St. Pauli
    [53.562, 9.961], // Sternschanze
    [53.548, 9.936], // Ottensen
    [53.553, 9.988], // Neustadt
    [53.558, 10.011], // St. Georg
  ] },
  munich: { relation: 62428, districts: [
    [48.137, 11.576], // Altstadt
    [48.128, 11.569], // Glockenbachviertel
    [48.151, 11.575], // Maxvorstadt
    [48.164, 11.586], // Schwabing
    [48.128, 11.601], // Haidhausen
  ] },
  cologne: { relation: 62578, districts: [
    [50.937, 6.960], // Altstadt
    [50.939, 6.935], // Belgisches Viertel
    [50.930, 6.938], // Kwartier Latäng
    [50.951, 6.916], // Ehrenfeld
    [50.919, 6.961], // Südstadt
  ] },
  amsterdam: { relation: 271110, districts: [
    [52.373, 4.897], // Centrum
    [52.372, 4.883], // Jordaan
    [52.365, 4.883], // Leidseplein
    [52.366, 4.897], // Rembrandtplein
    [52.355, 4.891], // De Pijp
  ] },
  barcelona: { relation: 347950, districts: [
    [41.382, 2.178], // Barri Gòtic
    [41.385, 2.183], // El Born
    [41.379, 2.169], // El Raval
    [41.391, 2.155], // Eixample
    [41.403, 2.156], // Gràcia
    [41.374, 2.163], // Poble-sec
  ] },
  lisbon: { relation: 5400890, districts: [
    [38.713, -9.144], // Bairro Alto
    [38.710, -9.140], // Cais do Sodré
    [38.711, -9.136], // Chiado
    [38.707, -9.129], // Alfama
    [38.717, -9.148], // Príncipe Real
  ] },
  prague: { relation: 435514, districts: [
    [50.088, 14.421], // Staré Město
    [50.079, 14.425], // Nové Město
    [50.076, 14.439], // Vinohrady
    [50.084, 14.450], // Žižkov
    [50.100, 14.427], // Letná
  ] },
};
